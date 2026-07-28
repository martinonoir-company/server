import { User, UserRole } from '../users/entities/user.entity';
import { AgentsService } from './agents.service';
import { AgentStatus } from './entities/marketing-agent.entity';
import { AuthService } from '../auth/auth.service';
import { ForgotPasswordDto, ResetPasswordDto } from '../auth/dto/auth.dto';
import { PaystackProvider } from '../payments/providers/paystack.provider';
declare class AgentSignupDto {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    password: string;
    bankCode: string;
    bankAccountNumber: string;
}
declare class AgentLoginDto {
    email: string;
    password: string;
}
declare class ValidateAgentCodeDto {
    code: string;
}
declare class VerifyAgentBankAccountDto {
    accountNumber: string;
    bankCode: string;
}
declare class RejectAgentDto {
    reason?: string;
}
declare class SetAgentRateDto {
    bps?: number | null;
}
declare class SetGlobalRateDto {
    bps: number;
}
export declare class AgentsController {
    private readonly agentsService;
    private readonly authService;
    private readonly paystack;
    constructor(agentsService: AgentsService, authService: AuthService, paystack: PaystackProvider);
    signup(dto: AgentSignupDto): Promise<{
        data: {
            id: string;
            code: string;
            status: AgentStatus;
            bankAccountName: string;
            message: string;
        };
    }>;
    login(dto: AgentLoginDto): Promise<{
        data: {
            user: {
                id: string;
                email: string;
                firstName: string;
                lastName: string;
                role: UserRole;
            };
            accessToken: string;
            refreshToken: string;
            expiresIn: number;
        };
    }>;
    forgotPassword(dto: ForgotPasswordDto): Promise<{
        data: {
            message: string;
        };
    }>;
    resetPassword(dto: ResetPasswordDto): Promise<{
        data: {
            message: string;
        };
    }>;
    listBanks(): Promise<{
        data: {
            name: string;
            code: string;
        }[];
    }>;
    verifyBankAccount(dto: VerifyAgentBankAccountDto): Promise<{
        data: {
            ok: boolean;
            error: string;
            accountName?: undefined;
        };
    } | {
        data: {
            ok: boolean;
            accountName: string;
            error?: undefined;
        };
    }>;
    validateCode(dto: ValidateAgentCodeDto): Promise<{
        data: {
            agentId: string;
            code: string;
            agentName: string;
        };
    }>;
    myDashboard(user: User): Promise<{
        data: {
            agent: import("./entities/marketing-agent.entity").MarketingAgent;
            totals: {
                walletBalanceMinor: number;
                lifetimeEarnedMinor: number;
                lifetimePaidMinor: number;
                ordersCount: number;
            };
            recentAttributions: import("./entities/agent-attribution.entity").AgentAttribution[];
            recentPayouts: import("./entities/agent-payout.entity").AgentPayout[];
        };
    }>;
    myAttributions(user: User, page?: string, limit?: string): Promise<{
        data: {
            items: import("./entities/agent-attribution.entity").AgentAttribution[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    myPayouts(user: User, page?: string, limit?: string): Promise<{
        data: {
            items: import("./entities/agent-payout.entity").AgentPayout[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    list(page?: string, limit?: string, status?: string, search?: string): Promise<{
        data: {
            items: import("./entities/marketing-agent.entity").MarketingAgent[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    getGlobalRate(): Promise<{
        data: {
            bps: number;
        };
    }>;
    setGlobalRate(dto: SetGlobalRateDto, user: User): Promise<{
        data: {
            bps: number;
        };
    }>;
    findOne(id: string): Promise<{
        data: {
            agent: import("./entities/marketing-agent.entity").MarketingAgent;
            totals: {
                walletBalanceMinor: number;
                lifetimeEarnedMinor: number;
                lifetimePaidMinor: number;
                ordersCount: number;
            };
            recentAttributions: import("./entities/agent-attribution.entity").AgentAttribution[];
            recentPayouts: import("./entities/agent-payout.entity").AgentPayout[];
        };
    }>;
    attributionsForAgent(id: string, page?: string, limit?: string): Promise<{
        data: {
            items: import("./entities/agent-attribution.entity").AgentAttribution[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    approve(id: string, user: User): Promise<{
        data: import("./entities/marketing-agent.entity").MarketingAgent;
    }>;
    reject(id: string, dto: RejectAgentDto, user: User): Promise<{
        data: import("./entities/marketing-agent.entity").MarketingAgent;
    }>;
    suspend(id: string, dto: RejectAgentDto, user: User): Promise<{
        data: import("./entities/marketing-agent.entity").MarketingAgent;
    }>;
    setAgentRate(id: string, dto: SetAgentRateDto): Promise<{
        data: import("./entities/marketing-agent.entity").MarketingAgent;
    }>;
    payout(id: string, user: User): Promise<{
        data: import("./entities/agent-payout.entity").AgentPayout;
    }>;
}
export {};
