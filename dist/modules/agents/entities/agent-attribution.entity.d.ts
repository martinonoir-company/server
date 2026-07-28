import { BaseEntity } from '../../../shared/entities/base.entity';
import { MarketingAgent } from './marketing-agent.entity';
import { Order } from '../../orders/entities/order.entity';
import { AgentPayout } from './agent-payout.entity';
export declare enum AgentAttributionStatus {
    PENDING = "PENDING",
    EARNED = "EARNED",
    REVERSED = "REVERSED",
    PAID = "PAID"
}
export declare class AgentAttribution extends BaseEntity {
    agentId: string;
    agent: MarketingAgent;
    agentCode: string;
    orderId: string;
    order: Order;
    orderNumber: string;
    orderTotalMinor: number;
    commissionRateBps: number;
    commissionMinor: number;
    currency: string;
    status: AgentAttributionStatus;
    channel: string;
    earnedAt?: Date | null;
    reversedAt?: Date | null;
    payoutId?: string | null;
    payout?: AgentPayout | null;
}
