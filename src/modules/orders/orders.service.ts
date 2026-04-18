import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order, OrderItem, OrderStatusHistory, OrderStatus, ORDER_TRANSITIONS, OrderChannel } from './entities/order.entity';
import { ProductVariant } from '../products/entities/product.entity';
import { Product } from '../products/entities/product.entity';
import { InventoryService } from '../inventory/inventory.service';
import { MovementKind } from '../inventory/entities/inventory.entity';
import { CreateOrderDto, UpdateOrderStatusDto, OrderQueryDto } from './dto/order.dto';

@Injectable()
export class OrdersService {
  private orderCounter = 0;

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(OrderStatusHistory) private readonly historyRepo: Repository<OrderStatusHistory>,
    @InjectRepository(ProductVariant) private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    private readonly inventoryService: InventoryService,
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

    return this.dataSource.transaction(async (manager) => {
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

        // 2. Reserve inventory
        if (variant.trackInventory) {
          await this.inventoryService.recordMovement({
            variantId: variant.id,
            kind: MovementKind.RESERVATION,
            quantity: cartItem.quantity,
            referenceType: 'ORDER',
            reason: 'Checkout reservation',
          });
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

      // 3. Create order
      const orderNumber = this.generateOrderNumber();
      const order = manager.create(Order, {
        orderNumber,
        userId,
        guestEmail: dto.guestEmail,
        status: OrderStatus.PENDING_PAYMENT,
        channel,
        currency,
        subtotal,
        discountTotal: 0,
        shippingTotal: 0,
        taxTotal: 0,
        grandTotal: subtotal,
        paymentMethod: dto.paymentMethod,
        shippingAddress: dto.shippingAddress,
        couponCode: dto.couponCode,
        customerNote: dto.customerNote,
        idempotencyKey: dto.idempotencyKey,
        items: orderItems.map((item) => manager.create(OrderItem, item)),
        statusHistory: [
          manager.create(OrderStatusHistory, {
            fromStatus: OrderStatus.DRAFT,
            toStatus: OrderStatus.PENDING_PAYMENT,
            changedBy: userId,
            reason: 'Checkout initiated',
          }),
        ],
      });

      return manager.save(Order, order);
    });
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
      return manager.findOneOrFail(Order, {
        where: { id: order.id },
        relations: ['items', 'statusHistory'],
        order: { statusHistory: { createdAt: 'ASC' } },
      });
    });
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

  // ── Generate Order Number ──

  private generateOrderNumber(): string {
    const now = new Date();
    const y = now.getFullYear().toString().slice(-2);
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    this.orderCounter++;
    const seq = this.orderCounter.toString().padStart(5, '0');
    return `MN-${y}${m}${d}-${seq}`;
  }
}
