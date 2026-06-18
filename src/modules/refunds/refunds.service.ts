import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  RefundRequest,
  RefundRequestItem,
  RefundStatus,
  RefundMethod,
} from './entities/refund-request.entity';
import {
  Order,
  OrderItem,
  OrderChannel,
  OrderStatus,
} from '../orders/entities/order.entity';
import {
  Payment,
  PaymentChannel,
  PaymentStatus,
  PaymentProvider,
  PaymentMethodType,
} from '../payments/entities/payment.entity';
import { InventoryService } from '../inventory/inventory.service';
import {
  MovementKind,
  StockMovement,
} from '../inventory/entities/inventory.entity';
import { PaystackProvider } from '../payments/providers/paystack.provider';
import { AgentsService } from '../agents/agents.service';

interface RefundLineInput {
  orderItemId?: string;
  variantId: string;
  quantity: number;
  reasonCode?: string;
  reasonNote?: string;
  /** Idempotency key from the scanner. Same one used for the stock movement. */
  clientLineId: string;
}

/**
 * Server-side orchestrator for the refund workflow.
 *
 * The flow:
 *   1. Scanner submits a return tied to an order → createFromReturn()
 *      writes RETURN stock movements AND a refund_request row.
 *   2. Super-admin (or auto, for cash) approves → execution path runs.
 *   3. Paystack provider call updates status to SUCCEEDED/FAILED.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @InjectRepository(RefundRequest)
    private readonly refundRepo: Repository<RefundRequest>,
    @InjectRepository(RefundRequestItem)
    private readonly itemRepo: Repository<RefundRequestItem>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(StockMovement)
    private readonly movementRepo: Repository<StockMovement>,
    private readonly inventoryService: InventoryService,
    private readonly paystack: PaystackProvider,
    private readonly dataSource: DataSource,
    @Optional()
    @Inject(forwardRef(() => AgentsService))
    private readonly agentsService?: AgentsService,
  ) {}

  // ── Look up an order by its order number for the scanner UI ──

  /**
   * Resolve an order for the scanner's "Which order?" screen.
   * Returns just enough for the cashier to confirm they have the right one.
   */
  async lookupOrderForReturn(orderNumber: string): Promise<{
    id: string;
    orderNumber: string;
    channel: OrderChannel;
    status: OrderStatus;
    grandTotal: number;
    currency: string;
    customerName?: string | null;
    customerPhone?: string | null;
    paidAt?: Date | null;
    items: Array<{
      id: string;
      variantId: string;
      productName: string;
      variantName?: string;
      sku: string;
      quantity: number;
      unitPrice: number;
    }>;
  }> {
    const order = await this.orderRepo.findOne({
      where: { orderNumber: orderNumber.trim().toUpperCase() },
      relations: { items: true, user: true },
    });
    if (!order) throw new NotFoundException(`Order ${orderNumber} not found`);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel,
      status: order.status,
      grandTotal: Number(order.grandTotal),
      currency: order.currency,
      customerName: order.user
        ? `${order.user.firstName ?? ''} ${order.user.lastName ?? ''}`.trim()
        : (order.shippingAddress
            ? `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`
            : null),
      customerPhone: order.user?.phone ?? order.shippingAddress?.phone ?? null,
      paidAt: order.paidAt ?? null,
      items:
        order.items?.map((i) => ({
          id: i.id,
          variantId: i.variantId,
          productName: i.productName,
          variantName: i.variantName,
          sku: i.sku,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
        })) ?? [],
    };
  }

  // ── Create a refund request from a scanner-submitted return ──

  /**
   * Atomic: record RETURN stock movements + create a refund_request.
   * Called by the scanner's "submit returns" action when the cashier
   * captured the order at the start of the return session.
   */
  async createFromReturn(input: {
    orderId: string;
    /** May be empty when the cashier skips the item scan. */
    lines: RefundLineInput[];
    warehouseCode?: string;
    /** Customer-stated reason for the whole return. */
    reason?: string;
    /** Cash refund paid out of the till — skips super-admin approval. */
    posCashRefund?: boolean;
    /** Bank details for a POS bank-transfer refund (verified upstream). */
    bankDetails?: {
      bankCode: string;
      accountNumber: string;
      accountName: string;
    };
    /**
     * Override the refund total (minor units). If set:
     *  - Replaces the sum of item line totals (e.g. when shipping was
     *    refunded too, or a partial refund is being offered).
     *  - REQUIRED when `lines` is empty (skipped item scan).
     *  - Capped at the order's grand total — we never refund more than
     *    the customer originally paid.
     */
    customAmount?: number;
    createdBy: string;
  }): Promise<RefundRequest> {
    const order = await this.orderRepo.findOne({
      where: { id: input.orderId },
      relations: { items: true },
    });
    if (!order) throw new NotFoundException(`Order ${input.orderId} not found`);

    // The order must have been paid for a refund to make sense. CANCELLED
    // / DRAFT / PENDING_PAYMENT orders never charged the customer.
    const refundableStatuses: OrderStatus[] = [
      OrderStatus.PAID,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.RETURN_REQUESTED,
      OrderStatus.RETURN_APPROVED,
      OrderStatus.RETURNED,
    ];
    if (!refundableStatuses.includes(order.status)) {
      throw new BadRequestException(
        `Order ${order.orderNumber} is ${order.status}; nothing to refund.`,
      );
    }

    // Map scanner lines → order items by variantId. We trust the original
    // unitPrice from the order, not the current variant price — the
    // customer should be refunded what they paid.
    const itemsByVariant = new Map(order.items?.map((i) => [i.variantId, i]));
    let computedTotalMinor = 0;
    let totalUnits = 0;
    const itemRows: Partial<RefundRequestItem>[] = [];

    for (const line of input.lines) {
      const oi = itemsByVariant.get(line.variantId);
      if (!oi) {
        throw new BadRequestException(
          `Variant ${line.variantId} was not on order ${order.orderNumber}.`,
        );
      }
      if (line.quantity <= 0 || line.quantity > oi.quantity) {
        throw new BadRequestException(
          `Returning ${line.quantity} of ${oi.productName} exceeds ordered quantity (${oi.quantity}).`,
        );
      }
      const lineTotal = Number(oi.unitPrice) * line.quantity;
      computedTotalMinor += lineTotal;
      totalUnits += line.quantity;
      itemRows.push({
        orderItemId: oi.id,
        variantId: oi.variantId,
        productName: oi.productName,
        variantName: oi.variantName,
        sku: oi.sku,
        quantity: line.quantity,
        unitPrice: Number(oi.unitPrice),
        lineTotal,
        reasonCode: line.reasonCode,
        reasonNote: line.reasonNote,
      });
    }

    // Resolve the actual amount we'll refund.
    //
    //  - lines + no customAmount  → sum of line totals
    //  - lines + customAmount     → override (partial refund or includes
    //                               shipping). Must not exceed the order
    //                               grand total.
    //  - no lines + customAmount  → skip-scan flow; the cashier inspects
    //                               items physically and just enters the
    //                               amount to refund.
    //  - no lines + no amount     → invalid
    let totalRefundMinor: number;
    if (input.customAmount && input.customAmount > 0) {
      const orderTotal = Number(order.grandTotal);
      if (input.customAmount > orderTotal) {
        throw new BadRequestException(
          `Refund amount (${input.customAmount}) exceeds order total (${orderTotal}).`,
        );
      }
      totalRefundMinor = Math.round(input.customAmount);
    } else if (input.lines.length === 0) {
      throw new BadRequestException(
        'Either scan items or provide a refund amount.',
      );
    } else {
      totalRefundMinor = computedTotalMinor;
    }

    // Find the original payment(s) — prefer one SUCCEEDED row matching the
    // order. For split payments we attach the largest SUCCEEDED row as the
    // "original" for refund-method inference; multi-tender split refunds
    // are out of scope for this iteration.
    const payments = await this.paymentRepo.find({
      where: { orderId: order.id, status: PaymentStatus.SUCCEEDED },
      order: { amount: 'DESC' },
    });
    const originalPayment = payments[0] ?? null;

    const channel = (order.channel === OrderChannel.POS
      ? PaymentChannel.POS
      : order.channel === OrderChannel.STOREFRONT
      ? PaymentChannel.STOREFRONT
      : PaymentChannel.MOBILE);

    // Decide the refund method.
    let method: RefundMethod;
    let status: RefundStatus = RefundStatus.PENDING;
    if (input.posCashRefund) {
      if (order.channel !== OrderChannel.POS) {
        throw new BadRequestException(
          'Cash refund is only allowed for POS orders.',
        );
      }
      method = RefundMethod.CASH;
      status = RefundStatus.COMPLETED_BY_STAFF;
    } else if (input.bankDetails) {
      method = RefundMethod.PAYSTACK_TRANSFER;
    } else if (
      originalPayment?.provider === PaymentProvider.PAYSTACK &&
      originalPayment?.providerReference
    ) {
      method = RefundMethod.PAYSTACK_REFUND;
    } else {
      // POS card / cash / bank-transfer orders with no Paystack handle —
      // require the cashier to supply bank details (transfer) or mark
      // cash. We reject here so the scanner UI prompts for next step.
      throw new BadRequestException(
        'This order requires bank details for a Paystack transfer refund. Capture and verify the customer account, then resubmit.',
      );
    }

    // Now write everything inside one transaction: stock movements + the
    // refund row + items. The RETURN movements use `referenceId = orderId`
    // (existing field on StockMovement) for the linkage.
    const refund = await this.dataSource.transaction(async (manager) => {
      const created = manager.create(RefundRequest, {
        orderId: order.id,
        originalPaymentId: originalPayment?.id ?? null,
        channel,
        amount: totalRefundMinor,
        currency: order.currency,
        itemsCount: totalUnits,
        status,
        method,
        reason: input.reason,
        requestedBy: input.createdBy,
        bankCode: input.bankDetails?.bankCode ?? null,
        bankAccountNumber: input.bankDetails?.accountNumber ?? null,
        bankAccountName: input.bankDetails?.accountName ?? null,
      });
      const savedRefund = await manager.save(RefundRequest, created);

      // Stock movements — one RETURN per line, idempotent on clientLineId.
      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i]!;
        const itemRow = itemRows[i]!;
        const { movement } = await this.inventoryService.recordMovementOnManager(
          manager,
          {
            variantId: line.variantId,
            kind: MovementKind.RETURN,
            quantity: line.quantity,
            warehouseCode: input.warehouseCode ?? 'DEFAULT',
            referenceId: order.id,
            referenceType: 'CUSTOMER_RETURN',
            reason:
              line.reasonNote
                ? `${line.reasonCode ?? 'Return'} — ${line.reasonNote}`
                : line.reasonCode ?? 'Return',
            createdBy: input.createdBy,
            clientLineId: line.clientLineId,
          },
        );

        await manager.save(
          RefundRequestItem,
          manager.create(RefundRequestItem, {
            ...itemRow,
            refundRequestId: savedRefund.id,
            stockMovementId: movement.id,
          }),
        );
      }

      // Move the order along its FSM if the channel supports it. We
      // intentionally do NOT auto-mark REFUNDED — that happens after the
      // refund SUCCEEDS in execute(). For COMPLETED_BY_STAFF cash, we go
      // straight to REFUNDED inside this same transaction.
      if (status === RefundStatus.COMPLETED_BY_STAFF) {
        await manager.update(
          Order,
          { id: order.id },
          { status: OrderStatus.REFUNDED },
        );
      }

      return savedRefund;
    });

    this.logger.log(
      `Created refund ${refund.id} for order ${order.orderNumber}: ` +
        `${refund.amount} ${refund.currency} via ${refund.method} (${refund.status})`,
    );
    return this.findById(refund.id);
  }

  // ── Super-admin workflow ──

  async list(opts: {
    page?: number;
    limit?: number;
    status?: RefundStatus;
    channel?: PaymentChannel;
    search?: string;
  }): Promise<{
    items: RefundRequest[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const qb = this.refundRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.order', 'o')
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (opts.status) qb.andWhere('r.status = :status', { status: opts.status });
    if (opts.channel) qb.andWhere('r.channel = :channel', { channel: opts.channel });
    if (opts.search) {
      qb.andWhere('o."orderNumber" ILIKE :s', { s: `%${opts.search}%` });
    }
    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<RefundRequest> {
    const r = await this.refundRepo.findOne({
      where: { id },
      relations: { order: true, originalPayment: true, items: true },
    });
    if (!r) throw new NotFoundException(`Refund ${id} not found`);
    return r;
  }

  /**
   * Super-admin approves a PENDING request and executes the refund.
   * Paystack refund is fire-and-confirm-via-webhook; we set PROCESSING
   * here and the webhook flips to SUCCEEDED/FAILED.
   *
   * `amountOverride` (minor units) lets the super admin reduce the
   * refund before sending it to the provider — useful for partial
   * refunds or when shipping/logistics should be retained. Cannot
   * exceed the original order's grand total.
   */
  async approve(
    id: string,
    decidedBy: string,
    amountOverride?: number,
  ): Promise<RefundRequest> {
    const r = await this.findById(id);
    if (r.status !== RefundStatus.PENDING) {
      throw new BadRequestException(
        `Refund is ${r.status}; only PENDING can be approved.`,
      );
    }
    if (amountOverride && amountOverride > 0) {
      const orderTotal = Number(r.order?.grandTotal ?? 0);
      if (orderTotal > 0 && amountOverride > orderTotal) {
        throw new BadRequestException(
          `Refund amount (${amountOverride}) exceeds order total (${orderTotal}).`,
        );
      }
      r.amount = Math.round(amountOverride);
    }
    r.decidedBy = decidedBy;
    r.decidedAt = new Date();
    r.status = RefundStatus.APPROVED;
    await this.refundRepo.save(r);

    // Execute immediately — for both methods. We don't queue; if the
    // provider call fails we set FAILED and the super admin can retry.
    return this.execute(r.id);
  }

  async reject(
    id: string,
    decidedBy: string,
    decisionReason?: string,
  ): Promise<RefundRequest> {
    const r = await this.findById(id);
    if (r.status !== RefundStatus.PENDING) {
      throw new BadRequestException(
        `Refund is ${r.status}; only PENDING can be rejected.`,
      );
    }
    r.decidedBy = decidedBy;
    r.decidedAt = new Date();
    r.decisionReason = decisionReason ?? null;
    r.status = RefundStatus.REJECTED;
    await this.refundRepo.save(r);
    return this.findById(id);
  }

  /**
   * Run the provider call. Re-callable on FAILED to retry.
   */
  async execute(id: string): Promise<RefundRequest> {
    const r = await this.findById(id);
    if (
      r.status !== RefundStatus.APPROVED &&
      r.status !== RefundStatus.FAILED
    ) {
      throw new BadRequestException(
        `Cannot execute refund in status ${r.status}.`,
      );
    }
    r.status = RefundStatus.PROCESSING;
    r.failureReason = null;
    await this.refundRepo.save(r);

    try {
      if (r.method === RefundMethod.PAYSTACK_REFUND) {
        if (!r.originalPayment?.providerReference) {
          throw new Error('Original Paystack reference missing on this order.');
        }
        const res = await this.paystack.refund({
          providerReference: r.originalPayment.providerReference,
          amount: Number(r.amount),
        });
        r.providerReference = res.refundReference;
        r.rawProviderData = res as unknown as Record<string, unknown>;
        // Paystack returns PENDING here; the webhook flips to SUCCEEDED.
        // For dev/stub mode (no real keys) the provider returns PENDING
        // too, so we leave the row PROCESSING and let the webhook /
        // reconcile path finish it.
        await this.refundRepo.save(r);
        return this.findById(id);
      }

      if (r.method === RefundMethod.PAYSTACK_TRANSFER) {
        if (
          !r.bankCode ||
          !r.bankAccountNumber ||
          !r.bankAccountName
        ) {
          throw new Error('Bank details are required for a transfer refund.');
        }
        // Reuse the recipient if we already created one.
        let recipientCode = r.transferRecipientCode;
        if (!recipientCode) {
          const recipient = await this.paystack.createTransferRecipient({
            accountNumber: r.bankAccountNumber,
            bankCode: r.bankCode,
            accountName: r.bankAccountName,
          });
          if ('error' in recipient) throw new Error(recipient.error);
          recipientCode = recipient.recipientCode;
          r.transferRecipientCode = recipientCode;
        }
        const transfer = await this.paystack.initiateTransfer({
          recipientCode,
          amount: Number(r.amount),
          reason: `Refund for order ${r.order?.orderNumber ?? r.orderId}`,
          reference: `RF-${r.id}`,
        });
        if ('error' in transfer) throw new Error(transfer.error);
        r.providerReference = transfer.providerReference;
        r.rawProviderData = transfer as unknown as Record<string, unknown>;
        if (transfer.status === 'SUCCEEDED') {
          r.status = RefundStatus.SUCCEEDED;
          r.refundedAt = new Date();
          await this.markOrderRefunded(r.orderId);
        }
        await this.refundRepo.save(r);
        return this.findById(id);
      }

      // CASH refunds never reach this path; they're COMPLETED_BY_STAFF
      // already.
      throw new Error(`Unsupported refund method ${r.method}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      r.status = RefundStatus.FAILED;
      r.failureReason = message;
      await this.refundRepo.save(r);
      this.logger.error(`Refund ${id} failed: ${message}`);
      return this.findById(id);
    }
  }

  /**
   * Called by the Paystack webhook controller when the refund/transfer
   * settles. Idempotent: safe to call repeatedly.
   */
  async settleByProviderReference(
    providerReference: string,
    outcome: 'SUCCEEDED' | 'FAILED',
    raw: Record<string, unknown>,
    failureReason?: string,
  ): Promise<RefundRequest | null> {
    const r = await this.refundRepo.findOne({
      where: { providerReference },
    });
    if (!r) return null;
    // Terminal states stay terminal.
    if (
      r.status === RefundStatus.SUCCEEDED ||
      r.status === RefundStatus.REJECTED
    ) {
      return r;
    }
    r.status =
      outcome === 'SUCCEEDED' ? RefundStatus.SUCCEEDED : RefundStatus.FAILED;
    if (outcome === 'SUCCEEDED') {
      r.refundedAt = new Date();
      await this.markOrderRefunded(r.orderId);
    } else {
      r.failureReason = failureReason ?? 'Provider reported failure';
    }
    r.rawProviderData = { ...(r.rawProviderData ?? {}), settle: raw };
    return this.refundRepo.save(r);
  }

  // ── Analytics: KPI on the dashboard ──

  /**
   * Total successfully refunded (NGN, minor units) + units returned in a
   * date range. Includes both SUCCEEDED (provider-confirmed) and
   * COMPLETED_BY_STAFF (cash) refunds.
   */
  async totalsRefunded(
    from: Date,
    to: Date,
  ): Promise<{ amountNgn: number; itemsCount: number; requestsCount: number }> {
    const row = await this.refundRepo
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.amount), 0)', 'amountNgn')
      .addSelect('COALESCE(SUM(r."itemsCount"), 0)', 'itemsCount')
      .addSelect('COUNT(*)::int', 'requestsCount')
      .where('r.status IN (:...statuses)', {
        statuses: [RefundStatus.SUCCEEDED, RefundStatus.COMPLETED_BY_STAFF],
      })
      .andWhere('r.currency = :ngn', { ngn: 'NGN' })
      .andWhere('r."createdAt" BETWEEN :from AND :to', { from, to })
      .getRawOne<{ amountNgn: string; itemsCount: string; requestsCount: number }>();
    return {
      amountNgn: Number(row?.amountNgn ?? 0),
      itemsCount: Number(row?.itemsCount ?? 0),
      requestsCount: Number(row?.requestsCount ?? 0),
    };
  }

  // ── Private helpers ──

  private async markOrderRefunded(orderId: string): Promise<void> {
    await this.orderRepo.update(
      { id: orderId },
      { status: OrderStatus.REFUNDED },
    );
    // Reverse any earned agent commission on this order. The agents
    // service handles the idempotency; if the order had no agentCode or
    // the attribution was already REVERSED, this is a no-op. We never
    // block the refund on this — failure is logged inside the service.
    if (this.agentsService) {
      await this.agentsService.reverseAttributionOnRefund(orderId);
    }
  }
}
