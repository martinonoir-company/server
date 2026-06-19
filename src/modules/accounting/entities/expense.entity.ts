import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Expense categories the business wants tracked. Kept as an enum so reports
 * can roll up consistently and so a typo can never become a new bucket.
 * Add new values explicitly; never let free-text leak into reporting.
 */
export enum ExpenseCategory {
  OPERATIONS = 'OPERATIONS',
  MARKETING = 'MARKETING',
  LOGISTICS = 'LOGISTICS',
  SALARIES = 'SALARIES',
  RENT_AND_UTILITIES = 'RENT_AND_UTILITIES',
  COGS_ADJUSTMENT = 'COGS_ADJUSTMENT',
  TAXES = 'TAXES',
  PROFESSIONAL_FEES = 'PROFESSIONAL_FEES',
  TRAVEL = 'TRAVEL',
  EQUIPMENT = 'EQUIPMENT',
  OTHER = 'OTHER',
}

/**
 * Manually-entered business expense. Money is in MINOR units (kobo) per
 * the rest of the system. We soft-delete rather than hard-delete so a
 * deleted-then-restored ledger is auditable. `incurredAt` is the
 * business date (the date the expense applies to), `createdAt` is when
 * it was recorded. Reports filter on `incurredAt`.
 */
@Entity('expenses')
@Index(['incurredAt'])
@Index(['category', 'incurredAt'])
export class Expense extends BaseEntity {
  /** Short label shown in tables, e.g. "Diesel — Nov" or "Ad campaign Q4". */
  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Index()
  @Column({ type: 'enum', enum: ExpenseCategory })
  category!: ExpenseCategory;

  /** Amount, NGN minor units (kobo). > 0 always. */
  @Column({ type: 'bigint' })
  amountMinor!: number;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency!: string;

  /**
   * Business date — what the expense applies to. May be different from
   * the date the row was entered. Stored as date-only (no time-of-day)
   * because accounting works in calendar buckets.
   */
  @Column({ type: 'date' })
  incurredAt!: Date;

  /** Free-form notes. Not used in reporting. */
  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  /** Optional vendor / payee name for the audit trail. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  vendor?: string | null;

  /**
   * Reference number from a receipt / invoice. Helps reconcile with the
   * physical paper trail during an audit.
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  referenceNumber?: string | null;

  /** Super-admin who entered the row. */
  @Column({ type: 'varchar', length: 26 })
  createdBy!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdBy' })
  createdByUser?: User | null;

  /** Last super-admin who edited the row. Null until first edit. */
  @Column({ type: 'varchar', length: 26, nullable: true })
  updatedBy?: string | null;
}
