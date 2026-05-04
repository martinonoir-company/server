import { Entity, Column, Index, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { ProductVariant } from '../../products/entities/product.entity';

/**
 * Movement kinds for the append-only stock ledger.
 * Every stock change is recorded as an immutable movement row.
 */
export enum MovementKind {
  /** Initial stock load / restock */
  RECEIPT = 'RECEIPT',
  /** Customer sale (online or POS) */
  SALE = 'SALE',
  /** Reserved during checkout (pre-payment) */
  RESERVATION = 'RESERVATION',
  /** Reservation released (expired or cancelled) */
  RELEASE = 'RELEASE',
  /** Customer return */
  RETURN = 'RETURN',
  /** Manual adjustment (damage, loss, audit) */
  ADJUSTMENT = 'ADJUSTMENT',
  /** Transfer between warehouses */
  TRANSFER_OUT = 'TRANSFER_OUT',
  TRANSFER_IN = 'TRANSFER_IN',
}

/**
 * Append-only stock movement — NEVER updated or deleted.
 * The `quantity` is always positive; the `kind` determines the effect:
 *   RECEIPT, RELEASE, RETURN, TRANSFER_IN → increases available
 *   SALE, RESERVATION, ADJUSTMENT, TRANSFER_OUT → decreases available
 */
@Entity('stock_movements')
@Index(
  ['referenceId', 'referenceType', 'variantId', 'kind'],
  { unique: true, where: '"referenceId" IS NOT NULL' },
)
export class StockMovement extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  variantId!: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variantId' })
  variant!: ProductVariant;

  @Column({ type: 'enum', enum: MovementKind })
  kind!: MovementKind;

  /** Always positive — the kind determines direction */
  @Column({ type: 'int' })
  quantity!: number;

  @Column({ type: 'varchar', length: 100, default: 'DEFAULT' })
  warehouseCode!: string;

  /** Reference to the source (order ID, adjustment ID, transfer ID, etc.) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  referenceId?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  referenceType?: string;

  /** Human-readable reason */
  @Column({ type: 'text', nullable: true })
  reason?: string;

  /** Staff/system that created this movement */
  @Column({ type: 'varchar', length: 26, nullable: true })
  createdBy?: string;
}

/**
 * Materialised stock level — updated transactionally with every movement.
 * This is the source of truth for "how much do we have right now?"
 */
@Entity('stock_levels')
@Index(['variantId', 'warehouseCode'], { unique: true })
export class StockLevel {
  @Column({ type: 'varchar', length: 26, primary: true })
  variantId!: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variantId' })
  variant!: ProductVariant;

  @Column({ type: 'varchar', length: 100, primary: true, default: 'DEFAULT' })
  warehouseCode!: string;

  /** Total on-hand quantity (receipts - sales - adjustments) */
  @Column({ type: 'int', default: 0 })
  onHand!: number;

  /** Quantity reserved for pending orders */
  @Column({ type: 'int', default: 0 })
  reserved!: number;

  /** Available = onHand - reserved */
  get available(): number {
    return this.onHand - this.reserved;
  }

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  lastMovementAt!: Date;
}
