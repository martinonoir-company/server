import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';
export declare enum AgentStatus {
    PENDING_APPROVAL = "PENDING_APPROVAL",
    APPROVED = "APPROVED",
    REJECTED = "REJECTED",
    SUSPENDED = "SUSPENDED"
}
export declare class MarketingAgent extends BaseEntity {
    userId: string;
    user: User;
    code: string;
    bankCode: string;
    bankAccountNumber: string;
    bankAccountName: string;
    transferRecipientCode?: string | null;
    status: AgentStatus;
    decidedBy?: string | null;
    decidedAt?: Date | null;
    decisionReason?: string | null;
    commissionRateBps?: number | null;
    walletBalanceMinor: number;
    lifetimeEarnedMinor: number;
    lifetimePaidMinor: number;
}
