import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { Order } from '../../orders/entities/order.entity';
import { Payment, PaymentChannel } from '../../payments/entities/payment.entity';

/**
 * Lifecycle of a refund request.
 *
 * - PENDING        — created by a return at the till; awaiting super-admin
 * - APPROVED       — super-admin OK'd; provider call queued
 * - PROCESSING     — provider call in flight (Paystack refund or transfer)
 * - SUCCEEDED      — provider confirmed money moved
 * - FAILED         — provider rejected; super-admin can retry
 * - REJECTED       — super-admin declined the request
 * - COMPLETED_BY_STAFF — cash refund paid out of the till; no super-admin step
 */
export enum RefundStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REJECTED = 'REJECTED',
  COMPLETED_BY_STAFF = 'COMPLETED_BY_STAFF',
}

/**
 * How the customer will be paid back.
 *
 * - PAYSTACK_REFUND   — reverse the original card charge via Paystack refund
 * - PAYSTACK_TRANSFER — disburse to a bank account via Paystack transfer
 * - CASH              — paid back at the till from cash drawer
 */
export enum RefundMethod {
  PAYSTACK_REFUND = 'PAYSTACK_REFUND',
  PAYSTACK_TRANSFER = 'PAYSTACK_TRANSFER',
  CASH = 'CASH',
}

@Entity('refund_requests')
@Index(['status', 'createdAt'])
@Index(['orderId'])
export class RefundRequest extends BaseEntity {
  // ── Linkage ──

  @Column({ type: 'varchar', length: 26 })
  orderId!: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  /** Original payment we're refunding against (null for orphan returns). */
  @Column({ type: 'varchar', length: 26, nullable: true })
  originalPaymentId?: string | null;

  @ManyToOne(() => Payment, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'originalPaymentId' })
  originalPayment?: Payment | null;

  /** Channel the original order came through. Drives default refund method. */
  @Column({ type: 'enum', enum: PaymentChannel })
  channel!: PaymentChannel;

  // ── Money ──

  /** Total amount to refund, in minor units (kobo). */
  @Column({ type: 'bigint' })
  amount!: number;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency!: string;

  /** Total number of physical units coming back across all lines. */
  @Column({ type: 'int', default: 0 })
  itemsCount!: number;

  // ── Decision ──

  @Index()
  @Column({ type: 'enum', enum: RefundStatus, default: RefundStatus.PENDING })
  status!: RefundStatus;

  @Column({ type: 'enum', enum: RefundMethod })
  method!: RefundMethod;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  /** Who initiated (cashier or system user that created the return). */
  @Column({ type: 'varchar', length: 26, nullable: true })
  requestedBy?: string;

  /** Super admin who approved / rejected. */
  @Column({ type: 'varchar', length: 26, nullable: true })
  decidedBy?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  decisionReason?: string | null;

  // ── Bank details (PAYSTACK_TRANSFER only) ──

  @Column({ type: 'varchar', length: 10, nullable: true })
  bankCode?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  bankAccountNumber?: string | null;

  /** Resolved via Paystack bank/resolve at request time. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  bankAccountName?: string | null;

  // ── Provider execution ──

  /** Paystack refund or transfer id, set when the provider call returns. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  providerReference?: string | null;

  /** Paystack transfer-recipient code, cached so retries reuse it. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  transferRecipientCode?: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  refundedAt?: Date | null;

  /** Raw provider response for audit. */
  @Column({ type: 'jsonb', nullable: true })
  rawProviderData?: Record<string, unknown> | null;

  // ── Items ──

  @OneToMany(() => RefundRequestItem, (item) => item.refundRequest, {
    cascade: true,
  })
  items?: RefundRequestItem[];
}

/**
 * One returned line on a refund request — maps a StockMovement (RETURN)
 * to the original OrderItem so the admin can see "1× Black Crossbody bag,
 * was sold at ₦19,500" alongside the refund.
 */
@Entity('refund_request_items')
@Index(['refundRequestId'])
export class RefundRequestItem extends BaseEntity {
  @Column({ type: 'varchar', length: 26 })
  refundRequestId!: string;

  @ManyToOne(() => RefundRequest, (r) => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'refundRequestId' })
  refundRequest!: RefundRequest;

  /** Original OrderItem id — what we're refunding. */
  @Column({ type: 'varchar', length: 26, nullable: true })
  orderItemId?: string | null;

  @Column({ type: 'varchar', length: 26 })
  variantId!: string;

  @Column({ type: 'varchar', length: 200 })
  productName!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  variantName?: string;

  @Column({ type: 'varchar', length: 100 })
  sku!: string;

  @Column({ type: 'int' })
  quantity!: number;

  /** Unit price at the time of the original sale, in minor units. */
  @Column({ type: 'bigint' })
  unitPrice!: number;

  /** unitPrice × quantity (denormalised for analytics). */
  @Column({ type: 'bigint' })
  lineTotal!: number;

  /** Reason the customer gave (matches scanner return reasons). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  reasonCode?: string;

  @Column({ type: 'text', nullable: true })
  reasonNote?: string;

  /** The StockMovement (kind=RETURN) row created by the scanner. */
  @Column({ type: 'varchar', length: 26, nullable: true })
  stockMovementId?: string | null;
}
