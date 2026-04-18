import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';

// ── Order Status FSM ──

export enum OrderStatus {
  DRAFT = 'DRAFT',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID = 'PAID',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  RETURN_REQUESTED = 'RETURN_REQUESTED',
  RETURN_APPROVED = 'RETURN_APPROVED',
  RETURNED = 'RETURNED',
  REFUNDED = 'REFUNDED',
}

/** Valid state transitions */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.DRAFT]: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED],
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [OrderStatus.RETURN_REQUESTED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.RETURN_REQUESTED]: [OrderStatus.RETURN_APPROVED, OrderStatus.DELIVERED],
  [OrderStatus.RETURN_APPROVED]: [OrderStatus.RETURNED],
  [OrderStatus.RETURNED]: [OrderStatus.REFUNDED],
  [OrderStatus.REFUNDED]: [],
};

export enum PaymentMethod {
  MONIEPOINT = 'MONIEPOINT',
  PAYSTACK = 'PAYSTACK',
  STRIPE = 'STRIPE',
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  POS_TERMINAL = 'POS_TERMINAL',
}

export enum OrderChannel {
  STOREFRONT = 'STOREFRONT',
  ADMIN = 'ADMIN',
  POS = 'POS',
}

// ── Order Entity ──

@Entity('orders')
export class Order extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  orderNumber!: string;

  @Index()
  @Column({ type: 'varchar', length: 26, nullable: true })
  userId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  /** Guest email for non-registered buyers */
  @Column({ type: 'varchar', length: 255, nullable: true })
  guestEmail?: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.DRAFT })
  status!: OrderStatus;

  @Column({ type: 'enum', enum: OrderChannel, default: OrderChannel.STOREFRONT })
  channel!: OrderChannel;

  /** Currency for this order (NGN or USD) */
  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency!: string;

  /** All money amounts in minor units (kobo/cents) */
  @Column({ type: 'bigint', default: 0 })
  subtotal!: number;

  @Column({ type: 'bigint', default: 0 })
  discountTotal!: number;

  @Column({ type: 'bigint', default: 0 })
  shippingTotal!: number;

  @Column({ type: 'bigint', default: 0 })
  taxTotal!: number;

  @Column({ type: 'bigint', default: 0 })
  grandTotal!: number;

  // ── Payment ──
  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  paymentMethod?: PaymentMethod;

  @Column({ type: 'varchar', length: 255, nullable: true })
  paymentReference?: string;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt?: Date;

  // ── Shipping Address ──
  @Column({ type: 'jsonb', nullable: true })
  shippingAddress?: {
    firstName: string;
    lastName: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode?: string;
    country: string;
    phone?: string;
  };

  // ── Coupon ──
  @Column({ type: 'varchar', length: 50, nullable: true })
  couponCode?: string;

  // ── Idempotency ──
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  idempotencyKey?: string;

  // ── Notes ──
  @Column({ type: 'text', nullable: true })
  customerNote?: string;

  @Column({ type: 'text', nullable: true })
  staffNote?: string;

  // ── Relations ──
  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items!: OrderItem[];

  @OneToMany(() => OrderStatusHistory, (h) => h.order, { cascade: true })
  statusHistory!: OrderStatusHistory[];
}

// ── Order Item ──

@Entity('order_items')
export class OrderItem extends BaseEntity {
  @Column({ type: 'varchar', length: 26 })
  orderId!: string;

  @ManyToOne(() => Order, (o) => o.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  @Column({ type: 'varchar', length: 26 })
  variantId!: string;

  /** Denormalised product info at time of purchase (price changes don't retroactively affect orders) */
  @Column({ type: 'varchar', length: 300 })
  productName!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  variantName?: string;

  @Column({ type: 'varchar', length: 100 })
  sku!: string;

  @Column({ type: 'int' })
  quantity!: number;

  /** Unit price in minor units at time of purchase */
  @Column({ type: 'bigint' })
  unitPrice!: number;

  /** Line total = unitPrice × quantity */
  @Column({ type: 'bigint' })
  lineTotal!: number;

  /** Discount applied to this line */
  @Column({ type: 'bigint', default: 0 })
  discountAmount!: number;

  @Column({ type: 'varchar', length: 512, nullable: true })
  imageUrl?: string;

  @Column({ type: 'jsonb', nullable: true })
  options?: Record<string, string>;
}

// ── Order Status History (audit trail) ──

@Entity('order_status_history')
export class OrderStatusHistory extends BaseEntity {
  @Column({ type: 'varchar', length: 26 })
  orderId!: string;

  @ManyToOne(() => Order, (o) => o.statusHistory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  @Column({ type: 'enum', enum: OrderStatus })
  fromStatus!: OrderStatus;

  @Column({ type: 'enum', enum: OrderStatus })
  toStatus!: OrderStatus;

  @Column({ type: 'varchar', length: 26, nullable: true })
  changedBy?: string;

  @Column({ type: 'text', nullable: true })
  reason?: string;
}
