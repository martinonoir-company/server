import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { Order } from '../../orders/entities/order.entity';

/**
 * A single payment attempt against an order.
 *
 * An order can have MANY payment rows:
 *   - split POS sales (cash + card on one sale) — one row each
 *   - retries after a failed attempt — a new row each
 *
 * The order is considered fully paid when the sum of SUCCEEDED rows for
 * that order is >= the order's grandTotal.
 *
 * This table is the single source of truth for payment/transaction
 * records shown in the admin Payments page and the POS Payments tab.
 */

/** Who/what processed the money. */
export enum PaymentProvider {
  PAYSTACK = 'PAYSTACK',
  MONIEPOINT = 'MONIEPOINT',
  /** Cash collected by a POS cashier — no external provider. */
  CASH = 'CASH',
}

/** Sales channel the payment originated from. */
export enum PaymentChannel {
  STOREFRONT = 'STOREFRONT',
  MOBILE = 'MOBILE',
  POS = 'POS',
}

/** How the customer paid. */
export enum PaymentMethodType {
  CARD = 'CARD',
  CASH = 'CASH',
  /** Bank transfer to a POS terminal's virtual account. */
  POS_TRANSFER = 'POS_TRANSFER',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

/**
 * Lifecycle of a payment row.
 *   PENDING     — created, awaiting customer action / provider
 *   PROCESSING  — provider is processing (card on terminal, gateway working)
 *   SUCCEEDED   — money confirmed received (authoritative)
 *   FAILED      — provider/terminal reported failure
 *   CANCELLED   — abandoned by the customer / staff
 *   REFUNDED    — money returned to the customer
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

@Entity('payments')
export class Payment extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  orderId!: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order?: Order;

  /** Denormalised so the payments list never needs an order join for display. */
  @Column({ type: 'varchar', length: 20 })
  orderNumber!: string;

  @Column({ type: 'enum', enum: PaymentProvider })
  provider!: PaymentProvider;

  @Column({ type: 'enum', enum: PaymentChannel })
  channel!: PaymentChannel;

  @Column({ type: 'enum', enum: PaymentMethodType })
  method!: PaymentMethodType;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status!: PaymentStatus;

  /** Amount in minor units (kobo / cents). */
  @Column({ type: 'bigint' })
  amount!: number;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency!: string;

  /**
   * Our own unique reference for this payment attempt. Sent to the
   * provider as the idempotency key (Paystack `reference`, Moniepoint
   * `merchantReference`). Unique so a retried network call can never
   * create a duplicate provider transaction.
   */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  merchantReference!: string;

  /** The reference the provider assigned (Paystack reference, Moniepoint transactionReference). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  providerReference?: string | null;

  /** POS terminal serial the card transaction was pushed to (Moniepoint). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  terminalSerial?: string | null;

  /** Hosted checkout URL (Paystack) the customer is redirected to. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  checkoutUrl?: string | null;

  /** Human-readable gateway/terminal response message. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  gatewayResponse?: string | null;

  /** Reason the payment failed, when status = FAILED. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  failureReason?: string | null;

  /** When the money was confirmed received. */
  @Column({ type: 'timestamptz', nullable: true })
  paidAt?: Date | null;

  /**
   * Raw provider verify response / webhook body, kept verbatim for audit
   * and dispute resolution. Never trusted for state — state comes only
   * from an authoritative verify/lookup call.
   */
  @Column({ type: 'jsonb', nullable: true })
  rawProviderData?: Record<string, unknown> | null;

  /** Last raw webhook payload received for this payment (audit trail). */
  @Column({ type: 'jsonb', nullable: true })
  rawWebhook?: Record<string, unknown> | null;

  /** Staff user id, for POS-initiated payments. */
  @Column({ type: 'varchar', length: 26, nullable: true })
  createdBy?: string | null;
}
