import { DataSource, Repository } from 'typeorm';
import { MarketingAgent, AgentStatus } from './entities/marketing-agent.entity';
import { AgentAttribution } from './entities/agent-attribution.entity';
import { AgentPayout } from './entities/agent-payout.entity';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { PaystackProvider } from '../payments/providers/paystack.provider';
interface CreateAgentInput {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    password: string;
    bankCode: string;
    bankAccountNumber: string;
}
export declare class AgentsService {
    private readonly agentRepo;
    private readonly attributionRepo;
    private readonly payoutRepo;
    private readonly userRepo;
    private readonly orderRepo;
    private readonly paystack;
    private readonly dataSource;
    private readonly logger;
    constructor(agentRepo: Repository<MarketingAgent>, attributionRepo: Repository<AgentAttribution>, payoutRepo: Repository<AgentPayout>, userRepo: Repository<User>, orderRepo: Repository<Order>, paystack: PaystackProvider, dataSource: DataSource);
    getGlobalRateBps(): Promise<number>;
    setGlobalRateBps(bps: number, updatedBy: string): Promise<number>;
    createAgent(input: CreateAgentInput): Promise<MarketingAgent>;
    authenticateForLogin(email: string, password: string): Promise<{
        user: User;
        agent: MarketingAgent;
    }>;
    list(opts: {
        page?: number;
        limit?: number;
        status?: AgentStatus;
        search?: string;
    }): Promise<{
        items: MarketingAgent[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    findById(id: string): Promise<MarketingAgent>;
    findByUserId(userId: string): Promise<MarketingAgent>;
    approve(id: string, decidedBy: string): Promise<MarketingAgent>;
    reject(id: string, decidedBy: string, reason?: string): Promise<MarketingAgent>;
    suspend(id: string, decidedBy: string, reason?: string): Promise<MarketingAgent>;
    setAgentRateBps(id: string, bpsOrNull: number | null): Promise<MarketingAgent>;
    validateAgentCode(rawCode: string): Promise<{
        agentId: string;
        code: string;
        agentName: string;
    }>;
    applyAttributionOnPaid(orderId: string): Promise<void>;
    reverseAttributionOnRefund(orderId: string): Promise<void>;
    dashboard(agentId: string): Promise<{
        agent: MarketingAgent;
        totals: {
            walletBalanceMinor: number;
            lifetimeEarnedMinor: number;
            lifetimePaidMinor: number;
            ordersCount: number;
        };
        recentAttributions: AgentAttribution[];
        recentPayouts: AgentPayout[];
    }>;
    listAttributionsForAgent(agentId: string, page?: number, limit?: number): Promise<{
        items: AgentAttribution[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    listPayoutsForAgent(agentId: string, page?: number, limit?: number): Promise<{
        items: AgentPayout[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    initiatePayout(agentId: string, initiatedBy: string): Promise<AgentPayout>;
    settlePayout(providerReference: string, outcome: 'SUCCEEDED' | 'FAILED', raw: Record<string, unknown>, failureReason?: string): Promise<AgentPayout | null>;
    private allocateUniqueCode;
    private nameMatchesAccount;
}
export {};
