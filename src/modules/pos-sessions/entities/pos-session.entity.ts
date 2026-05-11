import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { Terminal } from '../../branches/entities/terminal.entity';
import { User } from '../../users/entities/user.entity';

export enum PosSessionStatus {
  /** Items can be added/removed; not yet at payment. */
  ACTIVE = 'ACTIVE',
  /** Totals snapshotted; the cashier/scanner is collecting payment. */
  AWAITING_PAYMENT = 'AWAITING_PAYMENT',
  /** Finalised — an order was created. Terminal is free for the next sale. */
  COMPLETED = 'COMPLETED',
  /** Abandoned without creating an order. Terminal is free. */
  VOIDED = 'VOIDED',
}

/**
 * One line in a POS session cart. Lives inside the session's `cart` jsonb
 * column — POS sales are 1–30 items, well within a single row's reach.
 *
 * `clientLineId` is the idempotency key for adds: the POS web app and the
 * scanner each generate a UUID per scanned line; a rapid double-scan or a
 * retry-after-network-blip won't double-add.
 *
 * `scannedByStaffId` is the staff member whose JWT performed the add —
 * distinct from the session's `openedByStaffId` (the cashier who opened
 * the terminal). This lets us audit "Cashier A rang up the sale, but
 * Floor Staff B scanned this line in".
 */
export interface PosSessionLine {
  clientLineId: string;
  variantId: string;
  productId: string;
  productName: string;
  variantName: string | null;
  sku: string;
  barcode: string | null;
  /** Wholesale unit price in MINOR units (kobo/cents), resolved server-side. */
  unitPrice: number;
  quantity: number;
  imageUrl: string | null;
  options: Record<string, string> | null;
  /** Stock available at the branch warehouse at the time the line was added. */
  maxStock: number;
  scannedByStaffId: string;
  scannedAt: string;
}

export interface PosSessionCart {
  items: PosSessionLine[];
  currency: 'NGN' | 'USD';
  /** Totals snapshot — refreshed on every mutation. Minor units. */
  totals: {
    subtotal: number;
    discountTotal: number;
    grandTotal: number;
  };
  /** Coupon / manual discount applied at payment-intent time, if any. */
  couponCode?: string | null;
  discountAmount?: number;
  discountType?: 'COUPON' | 'MANUAL' | null;
}

@Entity('pos_sessions')
export class PosSession extends BaseEntity {
  @Index('IDX_pos_sessions_terminalId')
  @Column({ type: 'varchar', length: 26 })
  terminalId!: string;

  @ManyToOne(() => Terminal)
  @JoinColumn({ name: 'terminalId' })
  terminal?: Terminal;

  @Index('IDX_pos_sessions_branchId')
  @Column({ type: 'varchar', length: 26 })
  branchId!: string;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branchId' })
  branch?: Branch;

  /** The staff member who opened/claimed this terminal session. */
  @Column({ type: 'varchar', length: 26 })
  openedByStaffId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'openedByStaffId' })
  openedByStaff?: User;

  @Column({
    type: 'enum',
    enum: PosSessionStatus,
    default: PosSessionStatus.ACTIVE,
  })
  status!: PosSessionStatus;

  @Column({ type: 'jsonb' })
  cart!: PosSessionCart;

  /** Optimistic-concurrency version. Bumped on every successful mutation. */
  @Column({ type: 'int', default: 0 })
  version!: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  openedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt?: Date | null;

  /** Order number created on confirm (for the confirmed event payload). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  resultOrderNumber?: string | null;

  @Column({ type: 'varchar', length: 26, nullable: true })
  resultOrderId?: string | null;
}
