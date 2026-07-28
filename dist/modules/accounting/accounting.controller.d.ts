import { User } from '../users/entities/user.entity';
import { AccountingService } from './accounting.service';
import { ExpenseCategory } from './entities/expense.entity';
import { AccountingAuditAction } from './entities/accounting-audit-log.entity';
declare class DateRangeQueryDto {
    from?: string;
    to?: string;
}
declare class ListExpensesQueryDto extends DateRangeQueryDto {
    page?: number;
    limit?: number;
    category?: ExpenseCategory;
    search?: string;
    includeDeleted?: string;
}
declare class CreateExpenseDto {
    title: string;
    category: ExpenseCategory;
    amountMinor: number;
    incurredAt: string;
    notes?: string;
    vendor?: string;
    referenceNumber?: string;
}
declare class UpdateExpenseDto {
    title?: string;
    category?: ExpenseCategory;
    amountMinor?: number;
    incurredAt?: string;
    notes?: string | null;
    vendor?: string | null;
    referenceNumber?: string | null;
}
declare class ListAuditQueryDto extends DateRangeQueryDto {
    page?: number;
    limit?: number;
    action?: AccountingAuditAction;
    entityType?: string;
}
export declare class AccountingController {
    private readonly accountingService;
    constructor(accountingService: AccountingService);
    dashboard(q: DateRangeQueryDto): Promise<{
        data: {
            current: Awaited<ReturnType<AccountingService["pnl"]>>;
            previous: Awaited<ReturnType<AccountingService["pnl"]>>;
            topAgents: Awaited<ReturnType<AccountingService["topAgents"]>>;
            revenueSeries: import("./accounting.service").SeriesPoint[];
            expenseSeries: import("./accounting.service").SeriesPoint[];
        };
    }>;
    pnl(q: DateRangeQueryDto): Promise<{
        data: {
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
        };
    }>;
    vatReport(q: DateRangeQueryDto): Promise<{
        data: {
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
        };
    }>;
    exportPnl(q: DateRangeQueryDto, user: User): Promise<{
        data: {
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
        };
    }>;
    listExpenses(q: ListExpensesQueryDto): Promise<{
        data: {
            items: import("./entities/expense.entity").Expense[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    createExpense(dto: CreateExpenseDto, user: User): Promise<{
        data: import("./entities/expense.entity").Expense;
    }>;
    updateExpense(id: string, dto: UpdateExpenseDto, user: User): Promise<{
        data: import("./entities/expense.entity").Expense;
    }>;
    deleteExpense(id: string, user: User): Promise<{
        data: {
            ok: boolean;
        };
    }>;
    restoreExpense(id: string, user: User): Promise<{
        data: import("./entities/expense.entity").Expense;
    }>;
    listAudit(q: ListAuditQueryDto): Promise<{
        data: {
            items: import("./entities/accounting-audit-log.entity").AccountingAuditLog[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
}
export {};
