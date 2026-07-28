import { DataSource, Repository } from 'typeorm';
import { Expense, ExpenseCategory } from './entities/expense.entity';
import { AccountingAuditLog, AccountingAuditAction } from './entities/accounting-audit-log.entity';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { RefundRequest } from '../refunds/entities/refund-request.entity';
import { AgentAttribution } from '../agents/entities/agent-attribution.entity';
import { AgentPayout } from '../agents/entities/agent-payout.entity';
import { MarketingAgent } from '../agents/entities/marketing-agent.entity';
export interface SeriesPoint {
    date: string;
    amountNgn: number;
}
export declare class AccountingService {
    private readonly expenseRepo;
    private readonly auditRepo;
    private readonly orderRepo;
    private readonly refundRepo;
    private readonly attributionRepo;
    private readonly payoutRepo;
    private readonly agentRepo;
    private readonly userRepo;
    private readonly dataSource;
    private readonly logger;
    constructor(expenseRepo: Repository<Expense>, auditRepo: Repository<AccountingAuditLog>, orderRepo: Repository<Order>, refundRepo: Repository<RefundRequest>, attributionRepo: Repository<AgentAttribution>, payoutRepo: Repository<AgentPayout>, agentRepo: Repository<MarketingAgent>, userRepo: Repository<User>, dataSource: DataSource);
    private splitVat;
    private toRange;
    revenueTotalNgn(from: Date, to: Date): Promise<number>;
    wholesaleRevenueTotalNgn(from: Date, to: Date): Promise<{
        amountNgn: number;
        ordersCount: number;
    }>;
    grossProfitNgn(from: Date, to: Date): Promise<{
        profitNgn: number;
        itemsCosted: number;
        itemsTotal: number;
    }>;
    refundsTotalNgn(from: Date, to: Date): Promise<{
        amountNgn: number;
        itemsCount: number;
        requestsCount: number;
    }>;
    commissionsEarnedNgn(from: Date, to: Date): Promise<{
        amountNgn: number;
        ordersCount: number;
    }>;
    payoutsDisbursedNgn(from: Date, to: Date): Promise<{
        amountNgn: number;
        payoutsCount: number;
    }>;
    topAgents(from: Date, to: Date, limit?: number): Promise<Array<{
        agentId: string;
        code: string;
        name: string;
        ordersCount: number;
        commissionNgn: number;
    }>>;
    expensesTotalNgn(from: Date, to: Date): Promise<{
        amountNgn: number;
        count: number;
        byCategory: Array<{
            category: ExpenseCategory;
            amountNgn: number;
            count: number;
        }>;
    }>;
    listExpenses(opts: {
        page?: number;
        limit?: number;
        from?: string;
        to?: string;
        category?: ExpenseCategory;
        search?: string;
        includeDeleted?: boolean;
    }): Promise<{
        items: Expense[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    createExpense(actor: User, input: {
        title: string;
        category: ExpenseCategory;
        amountMinor: number;
        incurredAt: string;
        notes?: string;
        vendor?: string;
        referenceNumber?: string;
    }): Promise<Expense>;
    updateExpense(actor: User, id: string, patch: Partial<{
        title: string;
        category: ExpenseCategory;
        amountMinor: number;
        incurredAt: string;
        notes: string | null;
        vendor: string | null;
        referenceNumber: string | null;
    }>): Promise<Expense>;
    deleteExpense(actor: User, id: string): Promise<void>;
    restoreExpense(actor: User, id: string): Promise<Expense>;
    pnl(fromInput?: string | Date, toInput?: string | Date): Promise<{
        range: {
            from: string;
            to: string;
        };
        salesTaxRate: number;
        grossRevenueNgn: number;
        netRevenueNgn: number;
        vatOnRevenueNgn: number;
        grossProfit: {
            grossProfitNgn: number;
            netGrossProfitNgn: number;
            cogsNgn: number;
            itemsCosted: number;
            itemsTotal: number;
        };
        refunds: {
            grossAmountNgn: number;
            netAmountNgn: number;
            vatAmountNgn: number;
            itemsCount: number;
            requestsCount: number;
        };
        wholesale: {
            grossRevenueNgn: number;
            netRevenueNgn: number;
            ordersCount: number;
        };
        commissions: {
            amountNgn: number;
            ordersCount: number;
        };
        payoutsDisbursed: {
            amountNgn: number;
            payoutsCount: number;
        };
        expenses: {
            amountNgn: number;
            count: number;
            byCategory: Array<{
                category: ExpenseCategory;
                amountNgn: number;
                count: number;
            }>;
        };
        netProfitNgn: number;
    }>;
    dashboard(fromInput?: string | Date, toInput?: string | Date): Promise<{
        current: Awaited<ReturnType<AccountingService['pnl']>>;
        previous: Awaited<ReturnType<AccountingService['pnl']>>;
        topAgents: Awaited<ReturnType<AccountingService['topAgents']>>;
        revenueSeries: SeriesPoint[];
        expenseSeries: SeriesPoint[];
    }>;
    revenueSeries(from: Date, to: Date): Promise<SeriesPoint[]>;
    expenseSeries(from: Date, to: Date): Promise<SeriesPoint[]>;
    listAuditLog(opts: {
        page?: number;
        limit?: number;
        action?: AccountingAuditAction;
        entityType?: string;
        from?: string;
        to?: string;
    }): Promise<{
        items: AccountingAuditLog[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    logExport(actor: User, opts: {
        kind: string;
        range: {
            from: string;
            to: string;
        };
    }): Promise<void>;
    vatReport(fromInput?: string | Date, toInput?: string | Date): Promise<{
        range: {
            from: string;
            to: string;
        };
        salesTaxRate: number;
        revenue: {
            grossNgn: number;
            netNgn: number;
            vatNgn: number;
            ordersCount: number;
        };
        refunds: {
            grossNgn: number;
            netNgn: number;
            vatNgn: number;
            requestsCount: number;
        };
        inputVat: {
            amountNgn: number;
            expensesCount: number;
        };
        netVatPayableNgn: number;
    }>;
    private writeAudit;
    private toIsoDate;
    private fillSeries;
}
