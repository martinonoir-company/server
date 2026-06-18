import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order, OrderItem, OrderStatusHistory, OrderStatus, ORDER_TRANSITIONS, OrderChannel } from './entities/order.entity';
import { ProductVariant } from '../products/entities/product.entity';
import { Product } from '../products/entities/product.entity';
import { InventoryService } from '../inventory/inventory.service';
import { MovementKind } from '../inventory/entities/inventory.entity';
import { CartService } from '../cart/cart.service';
import { EmailService } from '../notifications/email.service';
import { PushService } from '../notifications/push.service';
import { User } from '../users/entities/user.entity';
import {
  CreateOrderDto,
  UpdateOrderStatusDto,
  OrderQueryDto,
  DispatchOrderDto,
  MarkDeliveredDto,
} from './dto/order.dto';
import { withUniqueOrderNumber } from './order-number.util';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(OrderStatusHistory) private readonly historyRepo: Repository<OrderStatusHistory>,
    @InjectRepository(ProductVariant) private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly inventoryService: InventoryService,
    private readonly cartService: CartService,
    private readonly emailService: EmailService,
    private readonly pushService: PushService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Checkout: Create Order ──

  async checkout(dto: CreateOrderDto, userId?: string): Promise<Order> {
    // Idempotency check
    if (dto.idempotencyKey) {
      const existing = await this.orderRepo.findOne({
        where: { idempotencyKey: dto.idempotencyKey },
        relations: ['items'],
      });
      if (existing) return existing;
    }

    const currency = dto.currency ?? 'NGN';

    const channel = dto.channel ?? OrderChannel.STOREFRONT;

    const order = await this.dataSource.transaction(async (manager) => {
      // 1. Resolve variants and calculate totals
      let subtotal = 0;
      const orderItems: Partial<OrderItem>[] = [];

      for (const cartItem of dto.items) {
        const variant = await manager.findOne(ProductVariant, {
          where: { id: cartItem.variantId, isActive: true },
        });
        if (!variant) {
          throw new NotFoundException(`Variant ${cartItem.variantId} not found`);
        }

        const product = await manager.findOne(Product, {
          where: { id: variant.productId },
        });
        if (!product || !product.isActive) {
          throw new BadRequestException(`Product for variant ${cartItem.variantId} is unavailable`);
        }

        // 2. Handle inventory based on channel
        if (variant.trackInventory) {
          if (channel === OrderChannel.POS) {
            // POS: immediate stock deduction (no reservation)
            await this.inventoryService.recordMovement({
              variantId: variant.id,
              kind: MovementKind.SALE,
              quantity: cartItem.quantity,
              referenceId: dto.idempotencyKey,
              referenceType: 'POS_SALE',
              reason: 'POS direct sale',
            });
          } else {
            // Storefront/Admin: reserve first, deduct on payment
            await this.inventoryService.recordMovement({
              variantId: variant.id,
              kind: MovementKind.RESERVATION,
              quantity: cartItem.quantity,
              referenceId: dto.idempotencyKey,
              referenceType: 'ORDER',
              reason: 'Checkout reservation',
            });
          }
        }

        // Get correct price based on channel + currency
        const isWholesale = channel === OrderChannel.POS || channel === OrderChannel.ADMIN;
        let unitPrice: number;
        if (isWholesale) {
          unitPrice = currency === 'USD' ? Number(variant.wholesalePriceUsd) : Number(variant.wholesalePriceNgn);
        } else {
          unitPrice = currency === 'USD' ? Number(variant.retailPriceUsd) : Number(variant.retailPriceNgn);
        }
        const lineTotal = unitPrice * cartItem.quantity;
        subtotal += lineTotal;

        orderItems.push({
          variantId: variant.id,
          productName: product.name,
          variantName: variant.name,
          sku: variant.sku,
          quantity: cartItem.quantity,
          unitPrice,
          lineTotal,
          options: variant.options,
        });
      }

      // 3. Create order. The order number is computed from the database
      //    inside this transaction; withUniqueOrderNumber retries with a
      //    fresh number if a concurrent checkout grabs the same sequence.
      const isPOS = channel === OrderChannel.POS;
      const initialStatus = isPOS ? OrderStatus.PAID : OrderStatus.PENDING_PAYMENT;
      return withUniqueOrderNumber(manager, 'MN', (orderNumber) => {
        const order = manager.create(Order, {
          orderNumber,
          userId,
          guestEmail: dto.guestEmail,
          status: initialStatus,
          channel,
          currency,
          subtotal,
          discountTotal: 0,
          shippingTotal: 0,
          taxTotal: 0,
          grandTotal: subtotal,
          paymentMethod: dto.paymentMethod,
          paidAt: isPOS ? new Date() : undefined,
          shippingAddress: dto.shippingAddress,
          couponCode: dto.couponCode,
          customerNote: dto.customerNote,
          idempotencyKey: dto.idempotencyKey,
          // Uppercased agent code captured at checkout (storefront /
          // mobile / POS). The PAID hook in PaymentsService.applyProviderState
          // reads this and credits the agent's wallet. Stored even when the
          // order is still DRAFT/PENDING_PAYMENT so it survives the gap
          // between checkout and Paystack settling.
          agentCode: dto.agentCode?.trim().toUpperCase() || null,
          items: orderItems.map((item) => manager.create(OrderItem, item)),
          statusHistory: [
            manager.create(OrderStatusHistory, {
              fromStatus: OrderStatus.DRAFT,
              toStatus: initialStatus,
              changedBy: userId,
              reason: isPOS ? 'POS sale — immediate payment' : 'Checkout initiated',
            }),
          ],
        });
        return manager.save(Order, order);
      });
    });

    // Clear the user's server-persisted cart once the order row is committed.
    // A cart-clear failure must NOT roll back the order, so this lives outside
    // the transaction and swallows errors (the next /cart read will still be
    // consistent on a best-effort basis).
    if (userId) {
      try {
        await this.cartService.clearCart(userId);
      } catch {
        // intentionally ignored — order already succeeded
      }
    }

    // Send order confirmation email (non-blocking)
    this.sendOrderEmail(order).catch((err) =>
      this.logger.error(`Order confirmation email failed: ${err.message}`),
    );

    return order;
  }

  // ── Transition Status (FSM) ──

  async transitionStatus(
    orderId: string,
    dto: UpdateOrderStatusDto,
    changedBy?: string,
  ): Promise<Order> {
    const order = await this.findOne(orderId);
    const allowedNext = ORDER_TRANSITIONS[order.status];

    if (!allowedNext.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${order.status} to ${dto.status}. Allowed: ${allowedNext.join(', ') || 'none'}`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      // Record history — save independently to avoid cascade issues
      const history = manager.create(OrderStatusHistory, {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: dto.status,
        changedBy,
        reason: dto.reason,
      });
      await manager.save(OrderStatusHistory, history);

      // Handle side effects
      if (dto.status === OrderStatus.PAID) {
        order.paidAt = new Date();
        // Convert reservations to sales
        for (const item of order.items) {
          await this.inventoryService.recordMovement({
            variantId: item.variantId,
            kind: MovementKind.RELEASE,
            quantity: item.quantity,
            referenceId: order.id,
            referenceType: 'ORDER',
            reason: 'Payment confirmed — releasing reservation',
          });
          await this.inventoryService.recordMovement({
            variantId: item.variantId,
            kind: MovementKind.SALE,
            quantity: item.quantity,
            referenceId: order.id,
            referenceType: 'ORDER',
            reason: 'Order paid',
          });
        }
      }

      if (dto.status === OrderStatus.CANCELLED) {
        // Release reservations
        for (const item of order.items) {
          await this.inventoryService.recordMovement({
            variantId: item.variantId,
            kind: MovementKind.RELEASE,
            quantity: item.quantity,
            referenceId: order.id,
            referenceType: 'ORDER',
            reason: dto.reason ?? 'Order cancelled',
          });
        }
      }

      if (dto.status === OrderStatus.RETURNED) {
        // Return stock
        for (const item of order.items) {
          await this.inventoryService.recordMovement({
            variantId: item.variantId,
            kind: MovementKind.RETURN,
            quantity: item.quantity,
            referenceId: order.id,
            referenceType: 'ORDER',
            reason: 'Order returned',
          });
        }
      }

      // Update order status directly without cascading relations
      await manager.update(Order, order.id, { status: dto.status, paidAt: order.paidAt });

      // Return fresh order
      const updated = await manager.findOneOrFail(Order, {
        where: { id: order.id },
        relations: ['items', 'statusHistory', 'user'],
        order: { statusHistory: { createdAt: 'ASC' } },
      });

      // Send status-specific emails (non-blocking, outside transaction)
      if (dto.status === OrderStatus.PAID) {
        this.sendOrderEmail(updated).catch((err) =>
          this.logger.error(`Order confirmation email failed: ${err.message}`),
        );
      }
      if (dto.status === OrderStatus.SHIPPED) {
        this.sendShippingEmail(updated).catch((err) =>
          this.logger.error(`Shipping notification email failed: ${err.message}`),
        );
      }

      return updated;
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Dispatch & Delivery (scanner mobile app)
  // ─────────────────────────────────────────────────────────────

  /**
   * Confirm physical handoff to the courier.
   *
   *  - Order must be in PROCESSING.
   *  - Every order item's `scannedQty` must equal the item's ordered
   *    `quantity` — partial dispatches are rejected (422) with the list
   *    of mismatched lines so the UI can highlight them.
   *  - On success: trackingNumber, carrier, shippedAt persisted;
   *    transitions to SHIPPED via the same FSM path the admin uses
   *    (history row written, shipping email fired with tracking info).
   *
   * Idempotency: if the order is already SHIPPED with a tracking number,
   * the call is a no-op and returns the current order — safe to retry.
   */
  async dispatchOrder(
    orderId: string,
    dto: DispatchOrderDto,
    staffId?: string,
  ): Promise<Order> {
    const order = await this.findOne(orderId);

    // Idempotent retry: already shipped with the same tracking number.
    if (
      order.status === OrderStatus.SHIPPED &&
      order.trackingNumber === dto.trackingNumber &&
      order.carrier === dto.carrier
    ) {
      this.logger.debug(
        `Idempotent dispatch: order ${order.orderNumber} already shipped with ${dto.trackingNumber}`,
      );
      return order;
    }

    // State guard: must be in PROCESSING.
    if (order.status !== OrderStatus.PROCESSING) {
      throw new BadRequestException(
        `Cannot dispatch order in status ${order.status}. Order must be in PROCESSING.`,
      );
    }

    // Quantity guard: every item must be fully scanned.
    const byItemId = new Map(order.items.map((i) => [i.id, i]));
    const mismatches: Array<{
      orderItemId: string;
      sku: string;
      ordered: number;
      scanned: number;
    }> = [];
    const seen = new Set<string>();

    for (const line of dto.items) {
      if (seen.has(line.orderItemId)) {
        throw new BadRequestException(
          `Duplicate orderItemId in dispatch payload: ${line.orderItemId}`,
        );
      }
      seen.add(line.orderItemId);

      const item = byItemId.get(line.orderItemId);
      if (!item) {
        throw new BadRequestException(
          `orderItemId ${line.orderItemId} does not belong to order ${order.orderNumber}`,
        );
      }
      if (line.scannedQty !== item.quantity) {
        mismatches.push({
          orderItemId: item.id,
          sku: item.sku,
          ordered: item.quantity,
          scanned: line.scannedQty,
        });
      }
    }

    // Missing items: any order item not represented in the payload.
    for (const item of order.items) {
      if (!seen.has(item.id)) {
        mismatches.push({
          orderItemId: item.id,
          sku: item.sku,
          ordered: item.quantity,
          scanned: 0,
        });
      }
    }

    if (mismatches.length > 0) {
      throw new ConflictException({
        error: 'DISPATCH_QUANTITY_MISMATCH',
        message:
          'Every order item must be fully scanned before dispatch. Resolve the mismatched lines.',
        mismatches,
      });
    }

    // All checks passed — persist tracking + transition status atomically.
    return this.dataSource.transaction(async (manager) => {
      const shippedAt = new Date();

      // Persist tracking metadata + status in one UPDATE.
      await manager.update(Order, order.id, {
        trackingNumber: dto.trackingNumber,
        carrier: dto.carrier,
        shippedAt,
        status: OrderStatus.SHIPPED,
      });

      // Status history row — preserves audit trail just like the FSM path.
      const history = manager.create(OrderStatusHistory, {
        orderId: order.id,
        fromStatus: OrderStatus.PROCESSING,
        toStatus: OrderStatus.SHIPPED,
        changedBy: staffId,
        reason: dto.note
          ? `Dispatched via ${dto.carrier} (${dto.trackingNumber}) — ${dto.note}`
          : `Dispatched via ${dto.carrier} (${dto.trackingNumber})`,
      });
      await manager.save(OrderStatusHistory, history);

      // Reload the canonical view.
      const updated = await manager.findOneOrFail(Order, {
        where: { id: order.id },
        relations: ['items', 'statusHistory', 'user'],
        order: { statusHistory: { createdAt: 'ASC' } },
      });

      // Fire shipping email outside the critical path. Now it can include
      // the real tracking number and carrier — the existing
      // sendShippingNotification signature already accepts both.
      this.sendShippingEmailWithTracking(updated).catch((err) =>
        this.logger.error(
          `Shipping notification email failed for ${updated.orderNumber}: ${err.message}`,
        ),
      );

      // Fire customer push (storefront mobile app). Guest orders have
      // no userId — sendToUser handles that as a no-op.
      this.pushService
        .sendToUser(updated.userId, {
          title: 'Your order is on its way',
          body: `Order ${updated.orderNumber} has shipped via ${updated.carrier ?? 'courier'}.`,
          data: {
            type: 'ORDER_SHIPPED',
            orderId: updated.id,
            orderNumber: updated.orderNumber,
            trackingNumber: updated.trackingNumber,
            carrier: updated.carrier,
          },
        })
        .catch((err) =>
          this.logger.error(
            `Shipped push failed for ${updated.orderNumber}: ${err instanceof Error ? err.message : err}`,
          ),
        );

      return updated;
    });
  }

  /**
   * Mark a shipment delivered.
   *
   *  - Order must be in SHIPPED.
   *  - Sets deliveredAt; transitions to DELIVERED via the FSM with a
   *    history row.
   *  - Sends a delivered email to the customer (or guest).
   *
   * Idempotent: already-DELIVERED orders return as-is.
   */
  async markDelivered(
    orderId: string,
    dto: MarkDeliveredDto,
    staffId?: string,
  ): Promise<Order> {
    const order = await this.findOne(orderId);

    if (order.status === OrderStatus.DELIVERED) {
      this.logger.debug(
        `Idempotent delivered: order ${order.orderNumber} already delivered`,
      );
      return order;
    }

    if (order.status !== OrderStatus.SHIPPED) {
      throw new BadRequestException(
        `Cannot mark delivered: order ${order.orderNumber} is in status ${order.status}, expected SHIPPED.`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const deliveredAt = new Date();

      await manager.update(Order, order.id, {
        deliveredAt,
        status: OrderStatus.DELIVERED,
      });

      const history = manager.create(OrderStatusHistory, {
        orderId: order.id,
        fromStatus: OrderStatus.SHIPPED,
        toStatus: OrderStatus.DELIVERED,
        changedBy: staffId,
        reason: dto.note ?? 'Delivered',
      });
      await manager.save(OrderStatusHistory, history);

      const updated = await manager.findOneOrFail(Order, {
        where: { id: order.id },
        relations: ['items', 'statusHistory', 'user'],
        order: { statusHistory: { createdAt: 'ASC' } },
      });

      this.sendDeliveredEmail(updated).catch((err) =>
        this.logger.error(
          `Delivered email failed for ${updated.orderNumber}: ${err.message}`,
        ),
      );

      this.pushService
        .sendToUser(updated.userId, {
          title: 'Your order has arrived',
          body: `Order ${updated.orderNumber} has been delivered. Enjoy!`,
          data: {
            type: 'ORDER_DELIVERED',
            orderId: updated.id,
            orderNumber: updated.orderNumber,
          },
        })
        .catch((err) =>
          this.logger.error(
            `Delivered push failed for ${updated.orderNumber}: ${err instanceof Error ? err.message : err}`,
          ),
        );

      return updated;
    });
  }

  /**
   * Shipping email variant that includes tracking + carrier from the
   * persisted order row. Falls back to the existing sendShippingEmail
   * (orderNumber only) if either field is somehow missing.
   */
  private async sendShippingEmailWithTracking(order: Order): Promise<void> {
    const email = await this.resolveOrderEmail(order);
    if (!email) return;
    await this.emailService.sendShippingNotification(
      email,
      order.orderNumber,
      order.trackingNumber,
      order.carrier,
    );
  }

  private async sendDeliveredEmail(order: Order): Promise<void> {
    const email = await this.resolveOrderEmail(order);
    if (!email) return;
    await this.emailService.sendOrderDelivered(email, order.orderNumber);
  }

  // ── Find All (paginated) ──

  async findAll(query: OrderQueryDto): Promise<{
    items: Order[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'item')
      .leftJoinAndSelect('order.user', 'user');

    if (query.status) {
      qb.andWhere('order.status = :status', { status: query.status });
    }
    if (query.userId) {
      qb.andWhere('order.userId = :userId', { userId: query.userId });
    }
    if (query.channel) {
      qb.andWhere('order.channel = :channel', { channel: query.channel });
    }
    if (query.startDate) {
      qb.andWhere('order.createdAt >= :startDate', { startDate: new Date(query.startDate) });
    }
    if (query.endDate) {
      // Include the full end date day
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('order.createdAt <= :endDate', { endDate: end });
    }
    if (query.search?.trim()) {
      qb.andWhere('order.orderNumber ILIKE :search', { search: `%${query.search.trim()}%` });
    }

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'DESC';
    qb.orderBy(`order.${sortBy}`, sortOrder);

    qb.skip(skip).take(limit);
    const [items, total] = await qb.getManyAndCount();

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ── Find One ──

  async findOne(id: string): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: ['items', 'statusHistory', 'user'],
      order: { statusHistory: { createdAt: 'ASC' } },
    });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  // ── Find by Order Number ──

  async findByOrderNumber(orderNumber: string): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { orderNumber },
      relations: ['items', 'statusHistory'],
    });
    if (!order) throw new NotFoundException(`Order #${orderNumber} not found`);
    return order;
  }

  // ── Email Helpers ──

  private async sendOrderEmail(order: Order): Promise<void> {
    const email = await this.resolveOrderEmail(order);
    if (!email) return;

    const items = order.items?.map((i) => ({
      name: i.productName,
      variant: i.variantName ?? '',
      quantity: i.quantity,
      price: Number(i.lineTotal),
    }));

    await this.emailService.sendOrderConfirmation(
      email,
      order.orderNumber,
      Number(order.grandTotal),
      order.currency,
      items,
    );
  }

  private async sendShippingEmail(order: Order): Promise<void> {
    const email = await this.resolveOrderEmail(order);
    if (!email) return;
    await this.emailService.sendShippingNotification(email, order.orderNumber);
  }

  private async resolveOrderEmail(order: Order): Promise<string | null> {
    if (order.guestEmail) return order.guestEmail;
    if (order.user?.email) return order.user.email;
    if (order.userId) {
      const user = await this.userRepo.findOne({ where: { id: order.userId } });
      return user?.email ?? null;
    }
    return null;
  }
}
