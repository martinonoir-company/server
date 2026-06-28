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

  /**
   * Branch the order was sold at. NULL for storefront / admin orders.
   * POS-channel orders created via the pos-sessions confirm flow set it.
   */
  @Index()
  @Column({ type: 'varchar', length: 26, nullable: true })
  branchId?: string | null;

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

  /**
   * Marketing-agent referral code captured at checkout (POS tender,
   * storefront checkout, or mobile checkout). Stored uppercase. When the
   * order reaches PAID, the AgentsService uses this to credit the agent's
   * wallet exactly once. NULL means no agent attribution.
   */
  @Index()
  @Column({ type: 'varchar', length: 16, nullable: true })
  agentCode?: string | null;

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

  // ── Coupon / Discount tracking ──
  @Column({ type: 'varchar', length: 50, nullable: true })
  couponCode?: string;

  /** COUPON or MANUAL — which type of discount was applied */
  @Column({ type: 'varchar', length: 20, nullable: true })
  discountType?: string;

  /** Staff user ID who applied the discount/coupon */
  @Column({ type: 'varchar', length: 26, nullable: true })
  discountAppliedBy?: string;

  /** Staff name who applied the discount/coupon (denormalised for display) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  discountAppliedByName?: string;

  /** Timestamp when the discount/coupon was applied */
  @Column({ type: 'timestamptz', nullable: true })
  discountAppliedAt?: Date;

  // ── Idempotency ──
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  idempotencyKey?: string;

  // ── Shipment / Delivery ──
  @Column({ type: 'varchar', length: 100, nullable: true })
  trackingNumber?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  carrier?: string;

  @Column({ type: 'timestamptz', nullable: true })
  shippedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt?: Date;

  // ── AAJ Express shipping integration ──
  //
  // The carrier integration is async. We hold the quote at checkout so
  // the customer sees a fixed price; AAJ honours the quoted total
  // until expiry. After payment we book + process; AAJ returns the
  // tracking id which is the customer-facing pointer.

  /**
   * True when the customer ticked "I don't need shipping" at checkout
   * (will arrange pickup themselves). When true: no shipping fee on
   * the order, no AAJ call after payment.
   */
  @Column({ type: 'boolean', default: false })
  shippingOptOut!: boolean;

  /** AAJ quote `booking` id (their draft id), so we can honour the price. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  shippingQuoteId?: string;

  /** When the AAJ quote expires; re-quote needed after this. */
  @Column({ type: 'timestamptz', nullable: true })
  shippingQuoteExpiresAt?: Date;

  /** AAJ `_id` of the created booking — used as the path for processBooking. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  shippingBookingId?: string;

  /** Tracking id assigned by AAJ on processBooking — used for customer tracking. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  shippingTrackingId?: string;

  /** URL to the printable shipping label PDF (returned by processBooking). */
  @Column({ type: 'varchar', length: 1024, nullable: true })
  shippingLabelUrl?: string;

  /**
   * AAJ shipment status enum: 0=LABEL_CREATED, 1=PICKED_UP, 2=IN_TRANSIT,
   * 3=OUT_FOR_DELIVERY, 4=DELIVERED. Stored as-is so the UI maps it
   * consistently.
   */
  @Column({ type: 'int', nullable: true })
  shippingStatus?: number;

  /** Cached event timeline from the last AAJ track call. */
  @Column({ type: 'jsonb', nullable: true })
  shippingEvents?: Array<{
    dateTime: string;
    status: number;
    scanType: string;
    description: string;
    location: string;
  }>;

  /** Last successful track call — used to cache for ~60s. */
  @Column({ type: 'timestamptz', nullable: true })
  shippingLastTrackedAt?: Date;

  /**
   * Cumulative number of times the bookAndProcess job failed. Reset on
   * success. Used by the retry worker to back off / page the admin.
   */
  @Column({ type: 'int', default: 0 })
  shippingRetryCount!: number;

  /** Last error from AAJ — surfaced to the admin alert. */
  @Column({ type: 'text', nullable: true })
  shippingLastError?: string;

  // ── Wholesale ──
  /**
   * True when the order contains at least one wholesale line. Denormalised
   * from the items so the admin can filter/aggregate wholesale orders
   * without joining order_items. Set at checkout from the line flags.
   */
  @Index()
  @Column({ type: 'boolean', default: false })
  isWholesale!: boolean;

  // ── Dispatch (branch → AAJ pickup sorting) ──
  /**
   * Sorting/handoff state for orders that require shipping (not opted out).
   * NULL for orders that don't need dispatch. PENDING once the order is
   * payable and awaiting staff sorting; DISPATCHED after a staff member
   * scans the order barcode to hand it to the AAJ courier.
   */
  @Index()
  @Column({ type: 'varchar', length: 20, nullable: true })
  dispatchStatus?: 'PENDING' | 'DISPATCHED' | null;

  @Column({ type: 'timestamptz', nullable: true })
  dispatchedAt?: Date | null;

  /** Staff user ID who scanned the order as dispatched. */
  @Column({ type: 'varchar', length: 26, nullable: true })
  dispatchedBy?: string | null;

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

  /**
   * True when this line was purchased at the wholesale price (unitPrice is
   * the variant's wholesale price, quantity ≥ MIN_WHOLESALE_QTY). Retail
   * lines are false. Captured at checkout; never recomputed afterwards.
   */
  @Column({ type: 'boolean', default: false })
  isWholesale!: boolean;
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
