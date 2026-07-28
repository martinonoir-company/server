"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AccountingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountingService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const expense_entity_1 = require("./entities/expense.entity");
const accounting_audit_log_entity_1 = require("./entities/accounting-audit-log.entity");
const user_entity_1 = require("../users/entities/user.entity");
const order_entity_1 = require("../orders/entities/order.entity");
const refund_request_entity_1 = require("../refunds/entities/refund-request.entity");
const agent_attribution_entity_1 = require("../agents/entities/agent-attribution.entity");
const agent_payout_entity_1 = require("../agents/entities/agent-payout.entity");
const marketing_agent_entity_1 = require("../agents/entities/marketing-agent.entity");
const tax_util_1 = require("../products/tax.util");
let AccountingService = AccountingService_1 = class AccountingService {
    constructor(expenseRepo, auditRepo, orderRepo, refundRepo, attributionRepo, payoutRepo, agentRepo, userRepo, dataSource) {
        this.expenseRepo = expenseRepo;
        this.auditRepo = auditRepo;
        this.orderRepo = orderRepo;
        this.refundRepo = refundRepo;
        this.attributionRepo = attributionRepo;
        this.payoutRepo = payoutRepo;
        this.agentRepo = agentRepo;
        this.userRepo = userRepo;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(AccountingService_1.name);
    }
    splitVat(grossMinor) {
        if (!Number.isFinite(grossMinor) || grossMinor <= 0) {
            return { netMinor: 0, vatMinor: 0 };
        }
        const netMinor = Math.round(grossMinor / (1 + tax_util_1.SALES_TAX_RATE));
        const vatMinor = grossMinor - netMinor;
        return { netMinor, vatMinor };
    }
    toRange(from, to) {
        const f = from ? new Date(from) : new Date(Date.now() - 30 * 86400 * 1000);
        const t = to ? new Date(to) : new Date();
        if (isNaN(f.getTime()) || isNaN(t.getTime())) {
            throw new common_1.BadRequestException('Invalid date range');
        }
        if (f > t)
            throw new common_1.BadRequestException('`from` must be before `to`');
        return { from: f, to: t };
    }
    async revenueTotalNgn(from, to) {
        const row = await this.orderRepo
            .createQueryBuilder('o')
            .select(`COALESCE(SUM(o."grandTotal"), 0)::bigint`, 'total')
            .where(`o.currency = :ngn`, { ngn: 'NGN' })
            .andWhere(`o.status IN (:...statuses)`, {
            statuses: [
                order_entity_1.OrderStatus.PAID,
                order_entity_1.OrderStatus.PROCESSING,
                order_entity_1.OrderStatus.SHIPPED,
                order_entity_1.OrderStatus.DELIVERED,
                order_entity_1.OrderStatus.RETURN_REQUESTED,
                order_entity_1.OrderStatus.RETURN_APPROVED,
                order_entity_1.OrderStatus.RETURNED,
                order_entity_1.OrderStatus.REFUNDED,
            ],
        })
            .andWhere(`o."paidAt" BETWEEN :from AND :to`, { from, to })
            .getRawOne();
        return Number(row?.total ?? 0);
    }
    async wholesaleRevenueTotalNgn(from, to) {
        const row = await this.orderRepo
            .createQueryBuilder('o')
            .select(`COALESCE(SUM(o."grandTotal"), 0)::bigint`, 'total')
            .addSelect(`COUNT(*)::int`, 'count')
            .where(`o.currency = :ngn`, { ngn: 'NGN' })
            .andWhere(`o."isWholesale" = true`)
            .andWhere(`o.status IN (:...statuses)`, {
            statuses: [
                order_entity_1.OrderStatus.PAID,
                order_entity_1.OrderStatus.PROCESSING,
                order_entity_1.OrderStatus.SHIPPED,
                order_entity_1.OrderStatus.DELIVERED,
                order_entity_1.OrderStatus.RETURN_REQUESTED,
                order_entity_1.OrderStatus.RETURN_APPROVED,
                order_entity_1.OrderStatus.RETURNED,
                order_entity_1.OrderStatus.REFUNDED,
            ],
        })
            .andWhere(`o."paidAt" BETWEEN :from AND :to`, { from, to })
            .getRawOne();
        return {
            amountNgn: Number(row?.total ?? 0),
            ordersCount: Number(row?.count ?? 0),
        };
    }
    async grossProfitNgn(from, to) {
        const row = await this.dataSource
            .createQueryBuilder()
            .from('order_items', 'oi')
            .innerJoin('orders', 'o', 'o.id = oi."orderId"')
            .innerJoin('product_variants', 'v', 'v.id = oi."variantId"')
            .select(`COALESCE(SUM(GREATEST(0, (oi."unitPrice" * oi.quantity) - COALESCE(oi."discountAmount", 0) - COALESCE(v."costPriceNgn", 0) * oi.quantity)), 0)::bigint`, 'profit')
            .addSelect(`COUNT(CASE WHEN v."costPriceNgn" IS NOT NULL THEN 1 END)::int`, 'itemsCosted')
            .addSelect(`COUNT(*)::int`, 'itemsTotal')
            .where(`o.currency = :ngn`, { ngn: 'NGN' })
            .andWhere(`o.status IN (:...statuses)`, {
            statuses: [
                order_entity_1.OrderStatus.PAID,
                order_entity_1.OrderStatus.PROCESSING,
                order_entity_1.OrderStatus.SHIPPED,
                order_entity_1.OrderStatus.DELIVERED,
                order_entity_1.OrderStatus.RETURN_REQUESTED,
                order_entity_1.OrderStatus.RETURN_APPROVED,
                order_entity_1.OrderStatus.RETURNED,
                order_entity_1.OrderStatus.REFUNDED,
            ],
        })
            .andWhere(`o."paidAt" BETWEEN :from AND :to`, { from, to })
            .getRawOne();
        return {
            profitNgn: Number(row?.profit ?? 0),
            itemsCosted: Number(row?.itemsCosted ?? 0),
            itemsTotal: Number(row?.itemsTotal ?? 0),
        };
    }
    async refundsTotalNgn(from, to) {
        const row = await this.refundRepo
            .createQueryBuilder('r')
            .select(`COALESCE(SUM(r.amount), 0)::bigint`, 'amountNgn')
            .addSelect(`COALESCE(SUM(r."itemsCount"), 0)::int`, 'itemsCount')
            .addSelect(`COUNT(*)::int`, 'requestsCount')
            .where(`r.status IN (:...statuses)`, {
            statuses: [refund_request_entity_1.RefundStatus.SUCCEEDED, refund_request_entity_1.RefundStatus.COMPLETED_BY_STAFF],
        })
            .andWhere(`r.currency = :ngn`, { ngn: 'NGN' })
            .andWhere(`r."createdAt" BETWEEN :from AND :to`, { from, to })
            .getRawOne();
        return {
            amountNgn: Number(row?.amountNgn ?? 0),
            itemsCount: Number(row?.itemsCount ?? 0),
            requestsCount: Number(row?.requestsCount ?? 0),
        };
    }
    async commissionsEarnedNgn(from, to) {
        const row = await this.attributionRepo
            .createQueryBuilder('a')
            .select(`COALESCE(SUM(a."commissionMinor"), 0)::bigint`, 'amountNgn')
            .addSelect(`COUNT(*)::int`, 'ordersCount')
            .where(`a.status IN (:...statuses)`, {
            statuses: [agent_attribution_entity_1.AgentAttributionStatus.EARNED, agent_attribution_entity_1.AgentAttributionStatus.PAID],
        })
            .andWhere(`a.currency = :ngn`, { ngn: 'NGN' })
            .andWhere(`a."earnedAt" BETWEEN :from AND :to`, { from, to })
            .getRawOne();
        return {
            amountNgn: Number(row?.amountNgn ?? 0),
            ordersCount: Number(row?.ordersCount ?? 0),
        };
    }
    async payoutsDisbursedNgn(from, to) {
        const row = await this.payoutRepo
            .createQueryBuilder('p')
            .select(`COALESCE(SUM(p."amountMinor"), 0)::bigint`, 'amountNgn')
            .addSelect(`COUNT(*)::int`, 'payoutsCount')
            .where(`p.status = :s`, { s: agent_payout_entity_1.AgentPayoutStatus.SUCCEEDED })
            .andWhere(`p.currency = :ngn`, { ngn: 'NGN' })
            .andWhere(`p."paidAt" BETWEEN :from AND :to`, { from, to })
            .getRawOne();
        return {
            amountNgn: Number(row?.amountNgn ?? 0),
            payoutsCount: Number(row?.payoutsCount ?? 0),
        };
    }
    async topAgents(from, to, limit = 5) {
        const rows = await this.attributionRepo
            .createQueryBuilder('a')
            .innerJoin('marketing_agents', 'm', 'm.id = a."agentId"')
            .innerJoin('users', 'u', 'u.id = m."userId"')
            .select('a."agentId"', 'agentId')
            .addSelect('m.code', 'code')
            .addSelect(`CONCAT(u."firstName", ' ', u."lastName")`, 'name')
            .addSelect('COUNT(*)::int', 'ordersCount')
            .addSelect(`COALESCE(SUM(a."commissionMinor"), 0)::bigint`, 'commissionNgn')
            .where(`a.status IN (:...statuses)`, {
            statuses: [agent_attribution_entity_1.AgentAttributionStatus.EARNED, agent_attribution_entity_1.AgentAttributionStatus.PAID],
        })
            .andWhere(`a.currency = :ngn`, { ngn: 'NGN' })
            .andWhere(`a."earnedAt" BETWEEN :from AND :to`, { from, to })
            .groupBy('a."agentId"')
            .addGroupBy('m.code')
            .addGroupBy('u."firstName"')
            .addGroupBy('u."lastName"')
            .orderBy('SUM(a."commissionMinor")', 'DESC')
            .limit(limit)
            .getRawMany();
        return rows.map((r) => ({
            agentId: r.agentId,
            code: r.code,
            name: r.name,
            ordersCount: Number(r.ordersCount),
            commissionNgn: Number(r.commissionNgn),
        }));
    }
    async expensesTotalNgn(from, to) {
        const overall = await this.expenseRepo
            .createQueryBuilder('e')
            .select(`COALESCE(SUM(e."amountMinor"), 0)::bigint`, 'amountNgn')
            .addSelect(`COUNT(*)::int`, 'count')
            .where(`e.currency = :ngn`, { ngn: 'NGN' })
            .andWhere(`e."incurredAt" BETWEEN :from AND :to`, {
            from: this.toIsoDate(from),
            to: this.toIsoDate(to),
        })
            .andWhere(`e."deletedAt" IS NULL`)
            .getRawOne();
        const byCategory = await this.expenseRepo
            .createQueryBuilder('e')
            .select(`e.category`, 'category')
            .addSelect(`COALESCE(SUM(e."amountMinor"), 0)::bigint`, 'amountNgn')
            .addSelect(`COUNT(*)::int`, 'count')
            .where(`e.currency = :ngn`, { ngn: 'NGN' })
            .andWhere(`e."incurredAt" BETWEEN :from AND :to`, {
            from: this.toIsoDate(from),
            to: this.toIsoDate(to),
        })
            .andWhere(`e."deletedAt" IS NULL`)
            .groupBy(`e.category`)
            .orderBy(`SUM(e."amountMinor")`, 'DESC')
            .getRawMany();
        return {
            amountNgn: Number(overall?.amountNgn ?? 0),
            count: Number(overall?.count ?? 0),
            byCategory: byCategory.map((r) => ({
                category: r.category,
                amountNgn: Number(r.amountNgn),
                count: Number(r.count),
            })),
        };
    }
    async listExpenses(opts) {
        const page = Math.max(1, opts.page ?? 1);
        const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
        const qb = this.expenseRepo
            .createQueryBuilder('e')
            .leftJoinAndSelect('e.createdByUser', 'u')
            .orderBy('e.incurredAt', 'DESC')
            .addOrderBy('e.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);
        if (!opts.includeDeleted)
            qb.andWhere(`e."deletedAt" IS NULL`);
        if (opts.category)
            qb.andWhere(`e.category = :c`, { c: opts.category });
        if (opts.from)
            qb.andWhere(`e."incurredAt" >= :from`, { from: opts.from });
        if (opts.to)
            qb.andWhere(`e."incurredAt" <= :to`, { to: opts.to });
        if (opts.search) {
            const s = `%${opts.search}%`;
            qb.andWhere(new typeorm_2.Brackets((b) => {
                b.where('e.title ILIKE :s', { s })
                    .orWhere('e.vendor ILIKE :s', { s })
                    .orWhere('e."referenceNumber" ILIKE :s', { s });
            }));
        }
        const [items, total] = await qb.getManyAndCount();
        return { items, total, page, limit, pages: Math.ceil(total / limit) };
    }
    async createExpense(actor, input) {
        if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
            throw new common_1.BadRequestException('Amount must be a positive integer in minor units (kobo).');
        }
        const incurredAt = new Date(input.incurredAt);
        if (isNaN(incurredAt.getTime())) {
            throw new common_1.BadRequestException('Invalid incurredAt date.');
        }
        return this.dataSource.transaction(async (manager) => {
            const expense = manager.create(expense_entity_1.Expense, {
                title: input.title.trim(),
                category: input.category,
                amountMinor: Math.round(input.amountMinor),
                currency: 'NGN',
                incurredAt,
                notes: input.notes?.trim() || null,
                vendor: input.vendor?.trim() || null,
                referenceNumber: input.referenceNumber?.trim() || null,
                createdBy: actor.id,
            });
            const saved = await manager.save(expense_entity_1.Expense, expense);
            await this.writeAudit(manager, actor, {
                action: accounting_audit_log_entity_1.AccountingAuditAction.EXPENSE_CREATED,
                entityType: 'expense',
                entityId: saved.id,
                payload: {
                    title: saved.title,
                    category: saved.category,
                    amountMinor: Number(saved.amountMinor),
                    incurredAt: this.toIsoDate(saved.incurredAt),
                },
            });
            return saved;
        });
    }
    async updateExpense(actor, id, patch) {
        return this.dataSource.transaction(async (manager) => {
            const existing = await manager.findOne(expense_entity_1.Expense, {
                where: { id, deletedAt: (0, typeorm_2.IsNull)() },
            });
            if (!existing)
                throw new common_1.NotFoundException(`Expense ${id} not found or deleted`);
            const before = {
                title: existing.title,
                category: existing.category,
                amountMinor: Number(existing.amountMinor),
                incurredAt: this.toIsoDate(existing.incurredAt),
                notes: existing.notes ?? null,
                vendor: existing.vendor ?? null,
                referenceNumber: existing.referenceNumber ?? null,
            };
            if (patch.title !== undefined)
                existing.title = patch.title.trim();
            if (patch.category !== undefined)
                existing.category = patch.category;
            if (patch.amountMinor !== undefined) {
                if (!Number.isFinite(patch.amountMinor) || patch.amountMinor <= 0) {
                    throw new common_1.BadRequestException('amountMinor must be positive');
                }
                existing.amountMinor = Math.round(patch.amountMinor);
            }
            if (patch.incurredAt !== undefined) {
                const d = new Date(patch.incurredAt);
                if (isNaN(d.getTime()))
                    throw new common_1.BadRequestException('Invalid incurredAt');
                existing.incurredAt = d;
            }
            if (patch.notes !== undefined)
                existing.notes = patch.notes?.trim() || null;
            if (patch.vendor !== undefined)
                existing.vendor = patch.vendor?.trim() || null;
            if (patch.referenceNumber !== undefined)
                existing.referenceNumber = patch.referenceNumber?.trim() || null;
            existing.updatedBy = actor.id;
            const saved = await manager.save(expense_entity_1.Expense, existing);
            const after = {
                title: saved.title,
                category: saved.category,
                amountMinor: Number(saved.amountMinor),
                incurredAt: this.toIsoDate(saved.incurredAt),
                notes: saved.notes ?? null,
                vendor: saved.vendor ?? null,
                referenceNumber: saved.referenceNumber ?? null,
            };
            await this.writeAudit(manager, actor, {
                action: accounting_audit_log_entity_1.AccountingAuditAction.EXPENSE_UPDATED,
                entityType: 'expense',
                entityId: saved.id,
                payload: { before, after },
            });
            return saved;
        });
    }
    async deleteExpense(actor, id) {
        await this.dataSource.transaction(async (manager) => {
            const existing = await manager.findOne(expense_entity_1.Expense, {
                where: { id, deletedAt: (0, typeorm_2.IsNull)() },
            });
            if (!existing)
                throw new common_1.NotFoundException(`Expense ${id} not found`);
            await manager.softDelete(expense_entity_1.Expense, id);
            await this.writeAudit(manager, actor, {
                action: accounting_audit_log_entity_1.AccountingAuditAction.EXPENSE_DELETED,
                entityType: 'expense',
                entityId: id,
                payload: {
                    title: existing.title,
                    category: existing.category,
                    amountMinor: Number(existing.amountMinor),
                },
            });
        });
    }
    async restoreExpense(actor, id) {
        return this.dataSource.transaction(async (manager) => {
            const existing = await manager.findOne(expense_entity_1.Expense, {
                where: { id, deletedAt: (0, typeorm_2.Not)((0, typeorm_2.IsNull)()) },
                withDeleted: true,
            });
            if (!existing)
                throw new common_1.NotFoundException(`Expense ${id} not found or not deleted`);
            await manager.restore(expense_entity_1.Expense, id);
            await this.writeAudit(manager, actor, {
                action: accounting_audit_log_entity_1.AccountingAuditAction.EXPENSE_RESTORED,
                entityType: 'expense',
                entityId: id,
                payload: { title: existing.title },
            });
            const restored = await manager.findOne(expense_entity_1.Expense, { where: { id } });
            return restored;
        });
    }
    async pnl(fromInput, toInput) {
        const { from, to } = this.toRange(fromInput, toInput);
        const [grossRevenueNgn, grossProfitRaw, refundsRaw, commissions, payoutsDisbursed, expenses, wholesaleRaw,] = await Promise.all([
            this.revenueTotalNgn(from, to),
            this.grossProfitNgn(from, to),
            this.refundsTotalNgn(from, to),
            this.commissionsEarnedNgn(from, to),
            this.payoutsDisbursedNgn(from, to),
            this.expensesTotalNgn(from, to),
            this.wholesaleRevenueTotalNgn(from, to),
        ]);
        const revenueSplit = this.splitVat(grossRevenueNgn);
        const refundsSplit = this.splitVat(refundsRaw.amountNgn);
        const cogsNgn = grossRevenueNgn - grossProfitRaw.profitNgn;
        const netGrossProfitNgn = revenueSplit.netMinor - cogsNgn;
        const netProfitNgn = netGrossProfitNgn -
            refundsSplit.netMinor -
            commissions.amountNgn -
            expenses.amountNgn;
        return {
            range: { from: from.toISOString(), to: to.toISOString() },
            salesTaxRate: tax_util_1.SALES_TAX_RATE,
            grossRevenueNgn,
            netRevenueNgn: revenueSplit.netMinor,
            vatOnRevenueNgn: revenueSplit.vatMinor,
            grossProfit: {
                grossProfitNgn: grossProfitRaw.profitNgn,
                netGrossProfitNgn,
                cogsNgn,
                itemsCosted: grossProfitRaw.itemsCosted,
                itemsTotal: grossProfitRaw.itemsTotal,
            },
            refunds: {
                grossAmountNgn: refundsRaw.amountNgn,
                netAmountNgn: refundsSplit.netMinor,
                vatAmountNgn: refundsSplit.vatMinor,
                itemsCount: refundsRaw.itemsCount,
                requestsCount: refundsRaw.requestsCount,
            },
            wholesale: {
                grossRevenueNgn: wholesaleRaw.amountNgn,
                netRevenueNgn: this.splitVat(wholesaleRaw.amountNgn).netMinor,
                ordersCount: wholesaleRaw.ordersCount,
            },
            commissions,
            payoutsDisbursed,
            expenses,
            netProfitNgn,
        };
    }
    async dashboard(fromInput, toInput) {
        const { from, to } = this.toRange(fromInput, toInput);
        const span = to.getTime() - from.getTime();
        const prevFrom = new Date(from.getTime() - span);
        const prevTo = new Date(from.getTime());
        const [current, previous, topAgents, revenueSeries, expenseSeries] = await Promise.all([
            this.pnl(from, to),
            this.pnl(prevFrom, prevTo),
            this.topAgents(from, to),
            this.revenueSeries(from, to),
            this.expenseSeries(from, to),
        ]);
        return { current, previous, topAgents, revenueSeries, expenseSeries };
    }
    async revenueSeries(from, to) {
        const rows = await this.orderRepo
            .createQueryBuilder('o')
            .select(`DATE(o."paidAt")`, 'date')
            .addSelect(`COALESCE(SUM(o."grandTotal"), 0)::bigint`, 'amountNgn')
            .where(`o.currency = :ngn`, { ngn: 'NGN' })
            .andWhere(`o.status IN (:...statuses)`, {
            statuses: [
                order_entity_1.OrderStatus.PAID,
                order_entity_1.OrderStatus.PROCESSING,
                order_entity_1.OrderStatus.SHIPPED,
                order_entity_1.OrderStatus.DELIVERED,
                order_entity_1.OrderStatus.RETURN_REQUESTED,
                order_entity_1.OrderStatus.RETURN_APPROVED,
                order_entity_1.OrderStatus.RETURNED,
                order_entity_1.OrderStatus.REFUNDED,
            ],
        })
            .andWhere(`o."paidAt" BETWEEN :from AND :to`, { from, to })
            .groupBy(`DATE(o."paidAt")`)
            .orderBy(`DATE(o."paidAt")`, 'ASC')
            .getRawMany();
        return this.fillSeries(rows, from, to);
    }
    async expenseSeries(from, to) {
        const rows = await this.expenseRepo
            .createQueryBuilder('e')
            .select(`e."incurredAt"`, 'date')
            .addSelect(`COALESCE(SUM(e."amountMinor"), 0)::bigint`, 'amountNgn')
            .where(`e.currency = :ngn`, { ngn: 'NGN' })
            .andWhere(`e."incurredAt" BETWEEN :from AND :to`, {
            from: this.toIsoDate(from),
            to: this.toIsoDate(to),
        })
            .andWhere(`e."deletedAt" IS NULL`)
            .groupBy(`e."incurredAt"`)
            .orderBy(`e."incurredAt"`, 'ASC')
            .getRawMany();
        return this.fillSeries(rows, from, to);
    }
    async listAuditLog(opts) {
        const page = Math.max(1, opts.page ?? 1);
        const limit = Math.min(100, Math.max(1, opts.limit ?? 30));
        const qb = this.auditRepo
            .createQueryBuilder('a')
            .leftJoinAndSelect('a.actor', 'u')
            .orderBy('a.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);
        if (opts.action)
            qb.andWhere(`a.action = :ac`, { ac: opts.action });
        if (opts.entityType)
            qb.andWhere(`a."entityType" = :et`, { et: opts.entityType });
        if (opts.from)
            qb.andWhere(`a."createdAt" >= :from`, { from: new Date(opts.from) });
        if (opts.to)
            qb.andWhere(`a."createdAt" <= :to`, { to: new Date(opts.to) });
        const [items, total] = await qb.getManyAndCount();
        return { items, total, page, limit, pages: Math.ceil(total / limit) };
    }
    async logExport(actor, opts) {
        await this.writeAudit(this.dataSource.manager, actor, {
            action: accounting_audit_log_entity_1.AccountingAuditAction.REPORT_EXPORTED,
            entityType: 'report',
            payload: opts,
        });
    }
    async vatReport(fromInput, toInput) {
        const { from, to } = this.toRange(fromInput, toInput);
        const revRow = await this.orderRepo
            .createQueryBuilder('o')
            .select(`COALESCE(SUM(o."grandTotal"), 0)::bigint`, 'gross')
            .addSelect(`COUNT(*)::int`, 'orders')
            .where(`o.currency = :ngn`, { ngn: 'NGN' })
            .andWhere(`o.status IN (:...statuses)`, {
            statuses: [
                order_entity_1.OrderStatus.PAID,
                order_entity_1.OrderStatus.PROCESSING,
                order_entity_1.OrderStatus.SHIPPED,
                order_entity_1.OrderStatus.DELIVERED,
                order_entity_1.OrderStatus.RETURN_REQUESTED,
                order_entity_1.OrderStatus.RETURN_APPROVED,
                order_entity_1.OrderStatus.RETURNED,
                order_entity_1.OrderStatus.REFUNDED,
            ],
        })
            .andWhere(`o."paidAt" BETWEEN :from AND :to`, { from, to })
            .getRawOne();
        const grossRev = Number(revRow?.gross ?? 0);
        const revSplit = this.splitVat(grossRev);
        const refRow = await this.refundRepo
            .createQueryBuilder('r')
            .select(`COALESCE(SUM(r.amount), 0)::bigint`, 'gross')
            .addSelect(`COUNT(*)::int`, 'reqs')
            .where(`r.status IN (:...statuses)`, {
            statuses: [refund_request_entity_1.RefundStatus.SUCCEEDED, refund_request_entity_1.RefundStatus.COMPLETED_BY_STAFF],
        })
            .andWhere(`r.currency = :ngn`, { ngn: 'NGN' })
            .andWhere(`r."createdAt" BETWEEN :from AND :to`, { from, to })
            .getRawOne();
        const grossRef = Number(refRow?.gross ?? 0);
        const refSplit = this.splitVat(grossRef);
        const inputVatAmount = 0;
        const inputExpensesCount = 0;
        const netVatPayableNgn = revSplit.vatMinor - refSplit.vatMinor - inputVatAmount;
        return {
            range: { from: from.toISOString(), to: to.toISOString() },
            salesTaxRate: tax_util_1.SALES_TAX_RATE,
            revenue: {
                grossNgn: grossRev,
                netNgn: revSplit.netMinor,
                vatNgn: revSplit.vatMinor,
                ordersCount: Number(revRow?.orders ?? 0),
            },
            refunds: {
                grossNgn: grossRef,
                netNgn: refSplit.netMinor,
                vatNgn: refSplit.vatMinor,
                requestsCount: Number(refRow?.reqs ?? 0),
            },
            inputVat: { amountNgn: inputVatAmount, expensesCount: inputExpensesCount },
            netVatPayableNgn,
        };
    }
    async writeAudit(manager, actor, entry) {
        await manager.save(accounting_audit_log_entity_1.AccountingAuditLog, manager.create(accounting_audit_log_entity_1.AccountingAuditLog, {
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId ?? null,
            actorId: actor.id,
            actorLabel: `${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim() ||
                actor.email,
            payload: entry.payload ?? null,
        }));
    }
    toIsoDate(d) {
        return d.toISOString().slice(0, 10);
    }
    fillSeries(rows, from, to) {
        const byKey = new Map();
        for (const r of rows) {
            const key = r.date instanceof Date
                ? this.toIsoDate(r.date)
                : String(r.date).slice(0, 10);
            byKey.set(key, Number(r.amountNgn));
        }
        const out = [];
        const cursor = new Date(this.toIsoDate(from));
        const end = new Date(this.toIsoDate(to));
        while (cursor <= end) {
            const key = this.toIsoDate(cursor);
            out.push({ date: key, amountNgn: byKey.get(key) ?? 0 });
            cursor.setDate(cursor.getDate() + 1);
        }
        return out;
    }
};
exports.AccountingService = AccountingService;
exports.AccountingService = AccountingService = AccountingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(expense_entity_1.Expense)),
    __param(1, (0, typeorm_1.InjectRepository)(accounting_audit_log_entity_1.AccountingAuditLog)),
    __param(2, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(3, (0, typeorm_1.InjectRepository)(refund_request_entity_1.RefundRequest)),
    __param(4, (0, typeorm_1.InjectRepository)(agent_attribution_entity_1.AgentAttribution)),
    __param(5, (0, typeorm_1.InjectRepository)(agent_payout_entity_1.AgentPayout)),
    __param(6, (0, typeorm_1.InjectRepository)(marketing_agent_entity_1.MarketingAgent)),
    __param(7, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource])
], AccountingService);
//# sourceMappingURL=accounting.service.js.map