import { Entity, Column, Index, CreateDateColumn, PrimaryColumn, BeforeInsert } from 'typeorm';
import { generateUlid } from '../../../shared/entities/base.entity';

/**
 * Immutable audit log entry.
 * NEVER updated or deleted — append-only by design.
 * Records every significant action by staff/admin users.
 */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryColumn('varchar', { length: 26 })
  id!: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = generateUlid();
  }

  /** Who performed the action */
  @Index()
  @Column({ type: 'varchar', length: 26 })
  actorId!: string;

  /** Actor's email at time of action (denormalised for immutability) */
  @Column({ type: 'varchar', length: 255 })
  actorEmail!: string;

  /** Actor's role at time of action */
  @Column({ type: 'varchar', length: 50 })
  actorRole!: string;

  /** Action performed (e.g., 'product.create', 'order.cancel', 'user.role_change') */
  @Index()
  @Column({ type: 'varchar', length: 100 })
  action!: string;

  /** Resource type (e.g., 'product', 'order', 'user', 'coupon') */
  @Index()
  @Column({ type: 'varchar', length: 50 })
  resourceType!: string;

  /** Resource ID */
  @Index()
  @Column({ type: 'varchar', length: 26 })
  resourceId!: string;

  /** Human-readable description */
  @Column({ type: 'text', nullable: true })
  description?: string;

  /** Snapshot of the resource BEFORE the change (for undo/audit review) */
  @Column({ type: 'jsonb', nullable: true })
  previousState?: Record<string, unknown>;

  /** Snapshot of the resource AFTER the change */
  @Column({ type: 'jsonb', nullable: true })
  newState?: Record<string, unknown>;

  /** Changed fields only (diff) */
  @Column({ type: 'jsonb', nullable: true })
  changes?: Record<string, { from: unknown; to: unknown }>;

  /** IP address of the actor */
  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  /** User agent string */
  @Column({ type: 'varchar', length: 512, nullable: true })
  userAgent?: string;

  /** Channel: 'admin', 'api', 'pos', 'system' */
  @Column({ type: 'varchar', length: 20, default: 'admin' })
  channel!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  // No updatedAt or deletedAt — this is immutable
}
