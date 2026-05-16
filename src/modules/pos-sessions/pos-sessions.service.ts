import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  PosSession,
  PosSessionCart,
  PosSessionLine,
  PosSessionStatus,
} from './entities/pos-session.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Terminal } from '../branches/entities/terminal.entity';
import { UserBranch } from '../branches/entities/user-branch.entity';
import { ProductVariant, Product, ProductMedia } from '../products/entities/product.entity';
import { StockLevel } from '../inventory/entities/inventory.entity';
import { UserRole } from '../users/entities/user.entity';
import { PosSyncService } from '../pos/pos-sync.service';
import { PosTransactionDto } from '../pos/dto/pos-sync.dto';
import { PosGateway } from '../realtime/pos.gateway';
import {
  AddSessionItemDto,
  ConfirmSessionDto,
  PaymentIntentDto,
  UpdateSessionItemDto,
} from './dto/pos-session.dto';

/** Caller identity passed from the controller (from the JWT). */
export interface SessionActor {
  staffId: string;
  role: UserRole;
}

@Injectable()
export class PosSessionsService {
  private readonly logger = new Logger(PosSessionsService.name);

  constructor(
    @InjectRepository(PosSession)
    private readonly sessionRepo: Repository<PosSession>,
    @InjectRepository(Terminal)
    private readonly terminalRepo: Repository<Terminal>,
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
    @InjectRepository(UserBranch)
    private readonly userBranchRepo: Repository<UserBranch>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductMedia)
    private readonly mediaRepo: Repository<ProductMedia>,
    @InjectRepository(StockLevel)
    private readonly levelRepo: Repository<StockLevel>,
    private readonly posSyncService: PosSyncService,
    private readonly gateway: PosGateway,
    private readonly dataSource: DataSource,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Open / fetch
  // ─────────────────────────────────────────────────────────────

  /**
   * Open (or join) the session on a terminal. Idempotent: if an
   * ACTIVE/AWAITING_PAYMENT session already exists, it's returned as-is —
   * a second staff member opening the same terminal joins the existing
   * session rather than creating a conflict.
   */
  async open(
    terminalCode: string,
    actor: SessionActor,
    currency: 'NGN' | 'USD' = 'NGN',
  ): Promise<PosSession> {
    const { terminal, branch } = await this.resolveTerminalAndBranch(
      terminalCode,
    );
    await this.assertActorAssignedToBranch(actor, branch.id);

    const existing = await this.sessionRepo.findOne({
      where: {
        terminalId: terminal.id,
        status: PosSessionStatus.ACTIVE,
        deletedAt: IsNull(),
      },
    });
    if (existing) return existing;

    const awaiting = await this.sessionRepo.findOne({
      where: {
        terminalId: terminal.id,
        status: PosSessionStatus.AWAITING_PAYMENT,
        deletedAt: IsNull(),
      },
    });
    if (awaiting) return awaiting;

    const cart: PosSessionCart = {
      items: [],
      currency,
      totals: { subtotal: 0, discountTotal: 0, grandTotal: 0 },
      couponCode: null,
      discountAmount: 0,
      discountType: null,
    };
    const session = this.sessionRepo.create({
      terminalId: terminal.id,
      branchId: branch.id,
      openedByStaffId: actor.staffId,
      status: PosSessionStatus.ACTIVE,
      cart,
      version: 0,
      openedAt: new Date(),
    });
    const saved = await this.sessionRepo.save(session);

    this.gateway.emitSessionOpened(terminal.code, {
      sessionId: saved.id,
      terminalCode: terminal.code,
      branchCode: branch.code,
      version: saved.version,
      cart: saved.cart,
      openedByStaffId: saved.openedByStaffId,
    });

    return saved;
  }

  /** Fetch the current open session for a terminal, or 404 if none. */
  async getCurrent(
    terminalCode: string,
    actor: SessionActor,
  ): Promise<PosSession> {
    const { terminal, branch } = await this.resolveTerminalAndBranch(
      terminalCode,
    );
    await this.assertActorAssignedToBranch(actor, branch.id);

    const session = await this.sessionRepo.findOne({
      where: [
        {
          terminalId: terminal.id,
          status: PosSessionStatus.ACTIVE,
          deletedAt: IsNull(),
        },
        {
          terminalId: terminal.id,
          status: PosSessionStatus.AWAITING_PAYMENT,
          deletedAt: IsNull(),
        },
      ],
      order: { createdAt: 'DESC' },
    });
    if (!session) {
      throw new NotFoundException('No open session on this terminal');
    }
    return session;
  }

  // ─────────────────────────────────────────────────────────────
  // Item mutations
  // ─────────────────────────────────────────────────────────────

  async addItem(
    terminalCode: string,
    actor: SessionActor,
    dto: AddSessionItemDto,
  ): Promise<PosSession> {
    return this.mutateActive(terminalCode, actor, dto.version, async (s) => {
      // Idempotency: same clientLineId already present → no-op (return s).
      const dup = s.cart.items.find((l) => l.clientLineId === dto.clientLineId);
      if (dup) {
        return { changed: false, kind: 'item-added' };
      }

      // Resolve the variant + product + image + stock at the branch warehouse.
      const variant = await this.variantRepo.findOne({
        where: { id: dto.variantId, isActive: true },
      });
      if (!variant) {
        throw new NotFoundException('Variant not found or inactive');
      }
      const product = await this.productRepo.findOne({
        where: { id: variant.productId, isActive: true },
      });
      if (!product) {
        throw new NotFoundException('Product not found or inactive');
      }
      const media = await this.mediaRepo.findOne({
        where: { productId: product.id, deletedAt: IsNull() },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      });
      const branch = await this.branchRepo.findOneOrFail({
        where: { id: s.branchId },
      });
      const level = await this.levelRepo.findOne({
        where: { variantId: variant.id, warehouseCode: branch.warehouseCode },
      });
      const available = level ? level.onHand - level.reserved : 0;

      const unitPrice =
        s.cart.currency === 'USD'
          ? Number(variant.wholesalePriceUsd)
          : Number(variant.wholesalePriceNgn);

      // If this exact variant is already in the cart (added under a
      // different clientLineId — e.g. POS web + scanner both scanned it),
      // bump that line's quantity rather than adding a second row.
      const sameVariant = s.cart.items.find(
        (l) => l.variantId === variant.id,
      );
      if (sameVariant) {
        sameVariant.quantity += dto.quantity;
        return { changed: true, kind: 'item-added' };
      }

      const line: PosSessionLine = {
        clientLineId: dto.clientLineId,
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        variantName: variant.name ?? null,
        sku: variant.sku,
        barcode: variant.barcode ?? null,
        unitPrice,
        quantity: dto.quantity,
        imageUrl: media?.url ?? null,
        options: variant.options ?? null,
        maxStock: available,
        scannedByStaffId: actor.staffId,
        scannedAt: new Date().toISOString(),
      };
      s.cart.items.push(line);
      return { changed: true, kind: 'item-added' };
    });
  }

  async updateItem(
    terminalCode: string,
    actor: SessionActor,
    lineId: string,
    dto: UpdateSessionItemDto,
  ): Promise<PosSession> {
    return this.mutateActive(terminalCode, actor, dto.version, async (s) => {
      const idx = s.cart.items.findIndex((l) => l.clientLineId === lineId);
      if (idx === -1) {
        throw new NotFoundException('Line not found in this session');
      }
      if (dto.quantity <= 0) {
        s.cart.items.splice(idx, 1);
        return { changed: true, kind: 'item-removed' };
      }
      s.cart.items[idx]!.quantity = dto.quantity;
      return { changed: true, kind: 'item-updated' };
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Payment intent / confirm / void
  // ─────────────────────────────────────────────────────────────

  async paymentIntent(
    terminalCode: string,
    actor: SessionActor,
    dto: PaymentIntentDto,
  ): Promise<PosSession> {
    const { terminal } = await this.resolveTerminalAndBranch(terminalCode);
    const session = await this.lockOpenSession(terminal.id, dto.version);
    await this.assertActorAssignedToBranch(actor, session.branchId);

    if (session.cart.items.length === 0) {
      throw new BadRequestException('Cannot proceed to payment: cart is empty');
    }

    // Snapshot any discount, recompute totals, flip to AWAITING_PAYMENT.
    session.cart.couponCode = dto.couponCode ?? null;
    session.cart.discountAmount = dto.discountAmount ?? 0;
    session.cart.discountType = dto.discountType ?? null;
    this.recomputeTotals(session.cart);
    session.status = PosSessionStatus.AWAITING_PAYMENT;
    session.version += 1;

    const saved = await this.sessionRepo.save(session);
    this.gateway.emitPaymentIntent(terminal.code, {
      sessionId: saved.id,
      terminalCode: terminal.code,
      version: saved.version,
      cart: saved.cart,
    });
    return saved;
  }

  /**
   * Finalise the sale. Builds a PosTransactionDto from the session cart +
   * payments and calls PosSyncService.processTransaction in-process — the
   * exact same pipeline the POS web app uses (order created PAID,
   * inventory SALE movements, audit trail, idempotency on the transaction
   * id). On success, the session is closed and the order number recorded.
   *
   * The session must be AWAITING_PAYMENT (paymentIntent must have been
   * called first) so totals are snapshotted.
   */
  async confirm(
    terminalCode: string,
    actor: SessionActor,
    dto: ConfirmSessionDto,
  ): Promise<PosSession> {
    const { terminal, branch } = await this.resolveTerminalAndBranch(
      terminalCode,
    );
    const session = await this.lockOpenSession(terminal.id, dto.version);
    await this.assertActorAssignedToBranch(actor, session.branchId);

    if (session.status !== PosSessionStatus.AWAITING_PAYMENT) {
      throw new ConflictException(
        'Session is not awaiting payment. Call payment-intent first.',
      );
    }
    if (session.cart.items.length === 0) {
      throw new BadRequestException('Cannot confirm: cart is empty');
    }
    if (!dto.payments || dto.payments.length === 0) {
      throw new BadRequestException('At least one payment is required');
    }

    // Build the POS transaction. transactionId = the session id, so the
    // existing `pos-${transactionId}` idempotency in PosSyncService makes
    // a retried confirm a no-op.
    const tx: PosTransactionDto = {
      transactionId: session.id,
      terminalId: terminal.code,
      staffId: actor.staffId,
      items: session.cart.items.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
      payments: dto.payments.map((p) => ({
        method: p.method,
        amount: p.amount,
      })),
      currency: session.cart.currency,
      timestamp: new Date().toISOString(),
      couponCode: session.cart.couponCode ?? undefined,
      discountAmount: session.cart.discountAmount || undefined,
      discountType: session.cart.discountType ?? undefined,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
    };

    const result = await this.posSyncService.processTransaction(tx);
    if (result.status !== 'SUCCESS' && result.status !== 'SKIPPED') {
      // processTransaction throws on hard failures; this branch is
      // defensive only.
      throw new ConflictException(result.reason ?? 'Sale could not be completed');
    }

    // Close the session, record the order, stamp the branch on the order.
    session.status = PosSessionStatus.COMPLETED;
    session.closedAt = new Date();
    session.resultOrderId = result.orderId ?? null;
    session.resultOrderNumber = result.orderNumber ?? null;
    session.version += 1;
    const saved = await this.sessionRepo.save(session);

    // Stamp branchId on the freshly created order (best effort — the
    // order is the source of truth; the column is informational).
    if (result.orderId) {
      await this.dataSource
        .query(`UPDATE "orders" SET "branchId" = $1 WHERE "id" = $2`, [
          branch.id,
          result.orderId,
        ])
        .catch((err) =>
          this.logger.error(
            `Failed to stamp branchId on order ${result.orderId}: ${err instanceof Error ? err.message : err}`,
          ),
        );
    }

    this.gateway.emitConfirmed(terminal.code, {
      sessionId: saved.id,
      terminalCode: terminal.code,
      version: saved.version,
      orderId: result.orderId ?? '',
      orderNumber: result.orderNumber ?? '',
    });

    return saved;
  }

  async void(
    terminalCode: string,
    actor: SessionActor,
    version: number,
    reason?: string,
  ): Promise<PosSession> {
    const { terminal } = await this.resolveTerminalAndBranch(terminalCode);
    const session = await this.lockOpenSession(terminal.id, version);
    await this.assertActorAssignedToBranch(actor, session.branchId);

    session.status = PosSessionStatus.VOIDED;
    session.closedAt = new Date();
    session.version += 1;
    const saved = await this.sessionRepo.save(session);

    this.gateway.emitVoided(terminal.code, {
      sessionId: saved.id,
      terminalCode: terminal.code,
      version: saved.version,
      reason,
    });
    return saved;
  }

  // ─────────────────────────────────────────────────────────────
  // Internals
  // ─────────────────────────────────────────────────────────────

  /**
   * Run a mutation on the open ACTIVE session for a terminal under
   * optimistic concurrency. The callback receives the session (with a
   * mutable `cart`), mutates it, and reports what changed; on `changed`
   * we bump the version, persist, and emit the matching event.
   */
  private async mutateActive(
    terminalCode: string,
    actor: SessionActor,
    expectedVersion: number,
    mutate: (
      s: PosSession,
    ) => Promise<{
      changed: boolean;
      kind: 'item-added' | 'item-updated' | 'item-removed';
    }>,
  ): Promise<PosSession> {
    const { terminal } = await this.resolveTerminalAndBranch(terminalCode);
    const session = await this.lockOpenSession(terminal.id, expectedVersion);
    await this.assertActorAssignedToBranch(actor, session.branchId);

    if (session.status !== PosSessionStatus.ACTIVE) {
      throw new ConflictException(
        'Session is no longer accepting item changes (already at payment or closed).',
      );
    }

    const { changed, kind } = await mutate(session);
    if (!changed) {
      return session; // idempotent no-op (e.g. duplicate clientLineId)
    }

    this.recomputeTotals(session.cart);
    session.version += 1;
    const saved = await this.sessionRepo.save(session);

    const payload = {
      sessionId: saved.id,
      terminalCode: terminal.code,
      version: saved.version,
      cart: saved.cart,
    };
    if (kind === 'item-added') this.gateway.emitItemAdded(terminal.code, payload);
    else if (kind === 'item-updated')
      this.gateway.emitItemUpdated(terminal.code, payload);
    else this.gateway.emitItemRemoved(terminal.code, payload);

    return saved;
  }

  /**
   * Load the open session for a terminal and assert the client's version
   * matches. A mismatch → 409 with the current version so the client can
   * refetch and retry.
   */
  private async lockOpenSession(
    terminalId: string,
    expectedVersion: number,
  ): Promise<PosSession> {
    const session = await this.sessionRepo.findOne({
      where: [
        {
          terminalId,
          status: PosSessionStatus.ACTIVE,
          deletedAt: IsNull(),
        },
        {
          terminalId,
          status: PosSessionStatus.AWAITING_PAYMENT,
          deletedAt: IsNull(),
        },
      ],
      order: { createdAt: 'DESC' },
    });
    if (!session) {
      throw new NotFoundException('No open session on this terminal');
    }
    if (session.version !== expectedVersion) {
      throw new ConflictException({
        error: 'SESSION_VERSION_CONFLICT',
        message:
          'The session changed since you last read it. Refetch and retry.',
        currentVersion: session.version,
      });
    }
    return session;
  }

  private async resolveTerminalAndBranch(
    terminalCode: string,
  ): Promise<{ terminal: Terminal; branch: Branch }> {
    const code = terminalCode.trim().toUpperCase();
    const terminal = await this.terminalRepo.findOne({
      where: { code, deletedAt: IsNull() },
    });
    if (!terminal) throw new NotFoundException('Terminal not found');
    if (!terminal.isActive) {
      throw new ConflictException('Terminal is inactive');
    }
    const branch = await this.branchRepo.findOne({
      where: { id: terminal.branchId, deletedAt: IsNull() },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    if (!branch.isActive) {
      throw new ConflictException('Branch is inactive');
    }
    return { terminal, branch };
  }

  private async assertActorAssignedToBranch(
    actor: SessionActor,
    branchId: string,
  ): Promise<void> {
    // Privileged roles can use any terminal.
    if (
      actor.role === UserRole.SUPER_ADMIN ||
      actor.role === UserRole.COMPANY_SUPER_ADMIN
    ) {
      return;
    }
    const assignment = await this.userBranchRepo.findOne({
      where: { userId: actor.staffId, branchId, deletedAt: IsNull() },
    });
    if (!assignment) {
      throw new ForbiddenException(
        'You are not assigned to this branch.',
      );
    }
  }

  /**
   * Recompute subtotal / discount / grand total from line items + discount.
   *
   * All amounts are MINOR units (kobo): `unitPrice` comes from the
   * variant's bigint kobo price and `discountAmount` is also kobo —
   * consistent with the order rows, the payments ledger, and the POS app.
   */
  private recomputeTotals(cart: PosSessionCart): void {
    const subtotal = cart.items.reduce(
      (sum, l) => sum + l.unitPrice * l.quantity,
      0,
    );
    const discountTotal = Math.min(
      Math.round(cart.discountAmount ?? 0),
      subtotal,
    );
    cart.totals = {
      subtotal,
      discountTotal,
      grandTotal: Math.max(0, subtotal - discountTotal),
    };
  }
}
