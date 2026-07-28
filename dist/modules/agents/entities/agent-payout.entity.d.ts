import { BaseEntity } from '../../../shared/entities/base.entity';
import { MarketingAgent } from './marketing-agent.entity';
import { AgentAttribution } from './agent-attribution.entity';
export declare enum AgentPayoutStatus {
    PENDING = "PENDING",
    PROCESSING = "PROCESSING",
    SUCCEEDED = "SUCCEEDED",
    FAILED = "FAILED"
}
export declare class AgentPayout extends BaseEntity {
    agentId: string;
    agent: MarketingAgent;
    amountMinor: number;
    currency: string;
    attributionCount: number;
    status: AgentPayoutStatus;
    bankCode: string;
    bankAccountNumber: string;
    bankAccountName: string;
    providerReference?: string | null;
    transferRecipientCode?: string | null;
    failureReason?: string | null;
    paidAt?: Date | null;
    initiatedBy: string;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    rawProviderData?: Record<string, unknown> | null;
    attributions?: AgentAttribution[];
}
