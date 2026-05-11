import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Expo push token registered by a customer's mobile device. One device →
 * one row. A user may have several active devices (phone + tablet).
 *
 * `isActive` is flipped to false when Expo returns DeviceNotRegistered
 * for the token; the row is preserved for audit but excluded from sends.
 *
 * Uniqueness is enforced on (userId, expoPushToken) via a partial unique
 * index in the migration — a token can be re-registered by the same user
 * after being marked inactive without creating a duplicate active row.
 */
@Entity('push_tokens')
export class PushToken extends BaseEntity {
  @Index('IDX_push_tokens_userId')
  @Column({ type: 'varchar', length: 26 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  /** Expo push token (format: `ExponentPushToken[xxx]` or `ExpoPushToken[xxx]`). */
  @Index('IDX_push_tokens_expoPushToken')
  @Column({ type: 'varchar', length: 200 })
  expoPushToken!: string;

  @Column({ type: 'enum', enum: ['ios', 'android'], nullable: true })
  platform?: 'ios' | 'android';

  /** Optional client-supplied label (e.g. "iPhone 15 — work"). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  deviceLabel?: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt?: Date;
}
