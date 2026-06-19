import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/** What kind of action was performed. Append-only enum — never re-use. */
export enum AccountingAuditAction {
  EXPENSE_CREATED = 'EXPENSE_CREATED',
  EXPENSE_UPDATED = 'EXPENSE_UPDATED',
  EXPENSE_DELETED = 'EXPENSE_DELETED',
  EXPENSE_RESTORED = 'EXPENSE_RESTORED',
  REPORT_EXPORTED = 'REPORT_EXPORTED',
}

/**
 * One row per mutating accounting action. Append-only — the table never
 * receives UPDATE or DELETE in normal operation, so the audit trail can
 * be trusted during regulatory review.
 *
 * `payload` is the small diff: before/after values for the changed
 * fields. We do NOT serialize entire row bodies (too verbose, risk of
 * leaking unrelated PII).
 */
@Entity('accounting_audit_log')
@Index(['action', 'createdAt'])
@Index(['entityType', 'entityId'])
export class AccountingAuditLog extends BaseEntity {
  @Index()
  @Column({ type: 'enum', enum: AccountingAuditAction })
  action!: AccountingAuditAction;

  /** Logical entity affected, e.g. 'expense'. */
  @Column({ type: 'varchar', length: 50 })
  entityType!: string;

  /** PK of the affected row, when applicable. */
  @Column({ type: 'varchar', length: 26, nullable: true })
  entityId?: string | null;

  /** Super-admin who triggered the action. */
  @Column({ type: 'varchar', length: 26 })
  actorId!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actorId' })
  actor?: User | null;

  /** Snapshot of name/email at the time of action, in case the user is later renamed. */
  @Column({ type: 'varchar', length: 200 })
  actorLabel!: string;

  /** Compact diff or context — see notes in service. */
  @Column({ type: 'jsonb', nullable: true })
  payload?: Record<string, unknown> | null;
}
