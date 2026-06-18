import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { MarketingAgent } from './marketing-agent.entity';
import { Order } from '../../orders/entities/order.entity';
import { AgentPayout } from './agent-payout.entity';

/**
 * One per (agent, order) pair. Created the moment an order is captured
 * with an agent code; flipped to EARNED when the order reaches PAID,
 * REVERSED if the order is refunded, PAID once a payout settles.
 *
 *  - PENDING   → order captured the code but is not yet PAID. No wallet
 *                effect. (We still create the row at attribution time so
 *                the order ↔ agent link is auditable.)
 *  - EARNED    → order is PAID. Wallet credited. Counts toward next payout.
 *  - REVERSED  → order is REFUNDED. Wallet debited. Excluded from payouts.
 *  - PAID      → included in a SUCCEEDED payout. Frozen.
 */
export enum AgentAttributionStatus {
  PENDING = 'PENDING',
  EARNED = 'EARNED',
  REVERSED = 'REVERSED',
  PAID = 'PAID',
}

@Entity('agent_attributions')
@Index(['agentId', 'status', 'createdAt'])
@Index(['orderId'], { unique: true })
export class AgentAttribution extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  agentId!: string;

  @ManyToOne(() => MarketingAgent, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'agentId' })
  agent!: MarketingAgent;

  /** Snapshot of the agent code at the time of attribution. */
  @Column({ type: 'varchar', length: 16 })
  agentCode!: string;

  @Column({ type: 'varchar', length: 26 })
  orderId!: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  /** Snapshot of the order number for cheap display in the dashboard. */
  @Column({ type: 'varchar', length: 20 })
  orderNumber!: string;

  /** Order grand total at attribution time (NGN minor units). */
  @Column({ type: 'bigint' })
  orderTotalMinor!: number;

  /**
   * Commission rate at attribution time, in basis points (1% = 100). We
   * snapshot so changing the global rate later doesn't change historical
   * earnings.
   */
  @Column({ type: 'int' })
  commissionRateBps!: number;

  /** floor(orderTotalMinor * commissionRateBps / 10_000). */
  @Column({ type: 'bigint' })
  commissionMinor!: number;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: AgentAttributionStatus,
    default: AgentAttributionStatus.PENDING,
  })
  status!: AgentAttributionStatus;

  /** Channel the order came through, for the agent's own analytics. */
  @Column({ type: 'varchar', length: 20 })
  channel!: string;

  @Column({ type: 'timestamptz', nullable: true })
  earnedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  reversedAt?: Date | null;

  /** Set when included in a SUCCEEDED payout. */
  @Column({ type: 'varchar', length: 26, nullable: true })
  payoutId?: string | null;

  @ManyToOne(() => AgentPayout, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'payoutId' })
  payout?: AgentPayout | null;
}
