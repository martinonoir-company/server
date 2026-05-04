import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';

export enum SyncJobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER',
}

/**
 * Persistent record of POS sync jobs.
 * Failed transactions are stored here for background retry.
 */
@Entity('pos_sync_jobs')
export class PosSyncJob extends BaseEntity {
  /** POS transaction ID — also the idempotency key */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  transactionId!: string;

  @Column({ type: 'varchar', length: 100 })
  terminalId!: string;

  /** Full transaction payload for retry */
  @Column({ type: 'jsonb' })
  transactionPayload!: Record<string, any>;

  @Index()
  @Column({ type: 'enum', enum: SyncJobStatus, default: SyncJobStatus.PENDING })
  status!: SyncJobStatus;

  @Column({ type: 'int', default: 0 })
  retryCount!: number;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  /** Order ID once successfully processed */
  @Column({ type: 'varchar', length: 26, nullable: true })
  orderId?: string;
}
