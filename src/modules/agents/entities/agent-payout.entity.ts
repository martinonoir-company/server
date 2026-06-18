import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { MarketingAgent } from './marketing-agent.entity';
import { AgentAttribution } from './agent-attribution.entity';

/**
 * One payout run for one agent. Sums the agent's EARNED attributions in
 * the chosen window, initiates a Paystack transfer to the agent's
 * verified bank account, and flips the included attributions to PAID
 * once the transfer settles.
 */
export enum AgentPayoutStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

@Entity('agent_payouts')
@Index(['agentId', 'createdAt'])
@Index(['status'])
export class AgentPayout extends BaseEntity {
  @Column({ type: 'varchar', length: 26 })
  agentId!: string;

  @ManyToOne(() => MarketingAgent, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'agentId' })
  agent!: MarketingAgent;

  /** Total amount disbursed (NGN minor units). */
  @Column({ type: 'bigint' })
  amountMinor!: number;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency!: string;

  /** Number of attributions rolled into this payout. */
  @Column({ type: 'int' })
  attributionCount!: number;

  @Column({
    type: 'enum',
    enum: AgentPayoutStatus,
    default: AgentPayoutStatus.PENDING,
  })
  status!: AgentPayoutStatus;

  /** Bank snapshot at payout time. */
  @Column({ type: 'varchar', length: 10 })
  bankCode!: string;
  @Column({ type: 'varchar', length: 20 })
  bankAccountNumber!: string;
  @Column({ type: 'varchar', length: 200 })
  bankAccountName!: string;

  /** Paystack transfer_code, set once initiated. */
  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  providerReference?: string | null;

  /** Reused per-agent recipient code. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  transferRecipientCode?: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt?: Date | null;

  @Column({ type: 'varchar', length: 26 })
  initiatedBy!: string;

  /** Period inclusive bounds for display only. */
  @Column({ type: 'timestamptz', nullable: true })
  periodStart?: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  periodEnd?: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  rawProviderData?: Record<string, unknown> | null;

  @OneToMany(() => AgentAttribution, (a) => a.payout)
  attributions?: AgentAttribution[];
}
