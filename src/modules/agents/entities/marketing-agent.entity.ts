import {
  Entity,
  Column,
  Index,
  OneToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Approval lifecycle.
 *
 *  - PENDING_APPROVAL — sign-up complete; the account exists but the
 *    user cannot log in until the super admin clicks Approve. Any auth
 *    attempt is rejected client-side AND server-side.
 *  - APPROVED        — agent can log in, accrue commission, request payouts.
 *  - REJECTED        — terminal. The account is permanently disabled.
 *  - SUSPENDED       — temporary disable (e.g. fraud review). Same effect
 *    as PENDING for login; no new attribution accrues.
 */
export enum AgentStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}

@Entity('marketing_agents')
@Index(['status'])
export class MarketingAgent extends BaseEntity {
  // ── Identity ──

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 26 })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  /**
   * Unique short referral code, format AAA-XXXX (first 3 letters of
   * firstName, hyphen, 4 random alphanumeric). Stored uppercase. Used
   * by POS / checkout / mobile to attribute an order to this agent.
   */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 16 })
  code!: string;

  // ── Bank details (verified at signup via Paystack) ──

  @Column({ type: 'varchar', length: 10 })
  bankCode!: string;

  @Column({ type: 'varchar', length: 20 })
  bankAccountNumber!: string;

  /** Name resolved by Paystack — what an inbound transfer will show. */
  @Column({ type: 'varchar', length: 200 })
  bankAccountName!: string;

  /**
   * Paystack transfer recipient code, cached so monthly payouts don't
   * re-create the recipient. Populated lazily by the payout flow.
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  transferRecipientCode?: string | null;

  // ── Status ──

  @Column({ type: 'enum', enum: AgentStatus, default: AgentStatus.PENDING_APPROVAL })
  status!: AgentStatus;

  @Column({ type: 'varchar', length: 26, nullable: true })
  decidedBy?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  decisionReason?: string | null;

  // ── Commission ──

  /**
   * Per-agent commission override, in basis points (1% = 100 bps). NULL
   * means "use the global setting". Basis points avoid float drift —
   * commission = orderTotal * bps / 10_000.
   */
  @Column({ type: 'int', nullable: true })
  commissionRateBps?: number | null;

  // ── Wallet (denormalised, kept in sync inside transactions) ──

  /**
   * Current owed-but-unpaid balance, NGN minor units (kobo). Equals
   * SUM(EARNED attributions) − SUM(REVERSED) − SUM(PAID payouts). Kept
   * denormalised so the agent dashboard doesn't need to re-aggregate
   * on every load.
   */
  @Column({ type: 'bigint', default: 0 })
  walletBalanceMinor!: number;

  /** Sum of all EARNED commission ever (never debited). */
  @Column({ type: 'bigint', default: 0 })
  lifetimeEarnedMinor!: number;

  /** Sum of all SUCCEEDED payouts. */
  @Column({ type: 'bigint', default: 0 })
  lifetimePaidMinor!: number;
}
