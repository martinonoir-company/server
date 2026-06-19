import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Repository,
  Between,
} from 'typeorm';
import { Expense, ExpenseCategory } from './entities/expense.entity';
import {
  AccountingAuditLog,
  AccountingAuditAction,
} from './entities/accounting-audit-log.entity';
import { User } from '../users/entities/user.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import {
  RefundRequest,
  RefundStatus,
} from '../refunds/entities/refund-request.entity';
import {
  AgentAttribution,
  AgentAttributionStatus,
} from '../agents/entities/agent-attribution.entity';
import {
  AgentPayout,
  AgentPayoutStatus,
} from '../agents/entities/agent-payout.entity';
import { MarketingAgent } from '../agents/entities/marketing-agent.entity';

/** Shared shape: a single bucket on a series (day / week / month). */
export interface SeriesPoint {
  /** ISO date for the bucket start. */
  date: string;
  /** Value in NGN minor units (kobo). */
  amountNgn: number;
}

/**
 * Accounting roll-ups. Source of truth is the operational tables:
 *
 *   - Revenue  ← orders.grandTotal where status flips to PAID and beyond.
 *   - Gross profit ← (unitPrice − costPriceNgn) × qty over PAID order items
 *                    on a NGN currency. Mirrors the existing analytics
 *                    formula so the two pages cannot disagree.
 *   - Refunds  ← refund_requests.amount where status ∈ { SUCCEEDED,
 *                COMPLETED_BY_STAFF }.
 *   - Commissions earned ← agent_attributions.commissionMinor where
 *                          status = EARNED.
 *   - Payouts disbursed   ← agent_payouts.amountMinor where status
 *                            = SUCCEEDED.
 *   - Expenses ← expenses.amountMinor (manually entered).
 *
 * Net profit (the metric on the dashboard) =
 *   grossProfit − refunds − commissionsEarned − expenses
 *
 * All money is bigint kobo throughout. The service NEVER converts to
 * naira; the UI does that.
 */
@Injectable()
export class AccountingService {
  private readonly logger = new Logger(AccountingService.name);

  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(AccountingAuditLog)
    private readonly auditRepo: Repository<AccountingAuditLog>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(RefundRequest)
    private readonly refundRepo: Repository<RefundRequest>,
    @InjectRepository(AgentAttribution)
    private readonly attributionRepo: Repository<AgentAttribution>,
    @InjectRepository(AgentPayout)
    private readonly payoutRepo: Repository<AgentPayout>,
    @InjectRepository(MarketingAgent)
    private readonly agentRepo: Repository<MarketingAgent>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Date-window helpers
  // ─────────────────────────────────────────────────────────────

  private toRange(
    from?: string | Date,
    to?: string | Date,
  ): { from: Date; to: Date } {
    const f = from ? new Date(from) : new Date(Date.now() - 30 * 86400 * 1000);
    const t = to ? new Date(to) : new Date();
    if (isNaN(f.getTime()) || isNaN(t.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    if (f > t) throw new BadRequestException('`from` must be before `to`');
    return { from: f, to: t };
  }

  // ─────────────────────────────────────────────────────────────
  // Revenue + Gross Profit (NGN, minor units)
  // ─────────────────────────────────────────────────────────────

  /**
   * Recognised revenue for the window. Revenue is recognised when an
   * order becomes PAID (or any subsequent status); CANCELLED / DRAFT /
   * PENDING_PAYMENT contribute nothing.
   */
  async revenueTotalNgn(from: Date, to: Date): Promise<number> {
    const row = await this.orderRepo
      .createQueryBuilder('o')
      .select(`COALESCE(SUM(o."grandTotal"), 0)::bigint`, 'total')
      .where(`o.currency = :ngn`, { ngn: 'NGN' })
      .andWhere(
        `o.status IN (:...statuses)`,
        {
          statuses: [
            OrderStatus.PAID,
            OrderStatus.PROCESSING,
            OrderStatus.SHIPPED,
            OrderStatus.DELIVERED,
            OrderStatus.RETURN_REQUESTED,
            OrderStatus.RETURN_APPROVED,
            OrderStatus.RETURNED,
            OrderStatus.REFUNDED,
          ],
        },
      )
      .andWhere(`o."paidAt" BETWEEN :from AND :to`, { from, to })
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  /**
   * Gross profit for the window. (unitPrice − costPriceNgn) × qty,
   * floored at 0 per line so a mis-tagged cost can't reduce profit.
   * USD orders are excluded because cost-price is stored as NGN only —
   * mixing currencies in one aggregate would corrupt the figure.
   */
  async grossProfitNgn(
    from: Date,
    to: Date,
  ): Promise<{
    profitNgn: number;
    itemsCosted: number;
    itemsTotal: number;
  }> {
    const row = await this.dataSource
      .createQueryBuilder()
      .from('order_items', 'oi')
      .innerJoin('orders', 'o', 'o.id = oi."orderId"')
      .innerJoin('product_variants', 'v', 'v.id = oi."variantId"')
      .select(
        `COALESCE(SUM(GREATEST(0, (oi."unitPrice" - COALESCE(v."costPriceNgn", 0)) * oi.quantity)), 0)::bigint`,
        'profit',
      )
      .addSelect(
        `COUNT(CASE WHEN v."costPriceNgn" IS NOT NULL THEN 1 END)::int`,
        'itemsCosted',
      )
      .addSelect(`COUNT(*)::int`, 'itemsTotal')
      .where(`o.currency = :ngn`, { ngn: 'NGN' })
      .andWhere(
        `o.status IN (:...statuses)`,
        {
          statuses: [
            OrderStatus.PAID,
            OrderStatus.PROCESSING,
            OrderStatus.SHIPPED,
            OrderStatus.DELIVERED,
            OrderStatus.RETURN_REQUESTED,
            OrderStatus.RETURN_APPROVED,
            OrderStatus.RETURNED,
            OrderStatus.REFUNDED,
          ],
        },
      )
      .andWhere(`o."paidAt" BETWEEN :from AND :to`, { from, to })
      .getRawOne<{ profit: string; itemsCosted: string; itemsTotal: string }>();
    return {
      profitNgn: Number(row?.profit ?? 0),
      itemsCosted: Number(row?.itemsCosted ?? 0),
      itemsTotal: Number(row?.itemsTotal ?? 0),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Refunds
  // ─────────────────────────────────────────────────────────────

  async refundsTotalNgn(
    from: Date,
    to: Date,
  ): Promise<{ amountNgn: number; itemsCount: number; requestsCount: number }> {
    const row = await this.refundRepo
      .createQueryBuilder('r')
      .select(`COALESCE(SUM(r.amount), 0)::bigint`, 'amountNgn')
      .addSelect(`COALESCE(SUM(r."itemsCount"), 0)::int`, 'itemsCount')
      .addSelect(`COUNT(*)::int`, 'requestsCount')
      .where(`r.status IN (:...statuses)`, {
        statuses: [RefundStatus.SUCCEEDED, RefundStatus.COMPLETED_BY_STAFF],
      })
      .andWhere(`r.currency = :ngn`, { ngn: 'NGN' })
      .andWhere(`r."createdAt" BETWEEN :from AND :to`, { from, to })
      .getRawOne<{
        amountNgn: string;
        itemsCount: string;
        requestsCount: string;
      }>();
    return {
      amountNgn: Number(row?.amountNgn ?? 0),
      itemsCount: Number(row?.itemsCount ?? 0),
      requestsCount: Number(row?.requestsCount ?? 0),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Agent commissions
  // ─────────────────────────────────────────────────────────────

  async commissionsEarnedNgn(
    from: Date,
    to: Date,
  ): Promise<{ amountNgn: number; ordersCount: number }> {
    const row = await this.attributionRepo
      .createQueryBuilder('a')
      .select(`COALESCE(SUM(a."commissionMinor"), 0)::bigint`, 'amountNgn')
      .addSelect(`COUNT(*)::int`, 'ordersCount')
      .where(`a.status IN (:...statuses)`, {
        statuses: [AgentAttributionStatus.EARNED, AgentAttributionStatus.PAID],
      })
      .andWhere(`a.currency = :ngn`, { ngn: 'NGN' })
      .andWhere(`a."earnedAt" BETWEEN :from AND :to`, { from, to })
      .getRawOne<{ amountNgn: string; ordersCount: string }>();
    return {
      amountNgn: Number(row?.amountNgn ?? 0),
      ordersCount: Number(row?.ordersCount ?? 0),
    };
  }

  async payoutsDisbursedNgn(
    from: Date,
    to: Date,
  ): Promise<{ amountNgn: number; payoutsCount: number }> {
    const row = await this.payoutRepo
      .createQueryBuilder('p')
      .select(`COALESCE(SUM(p."amountMinor"), 0)::bigint`, 'amountNgn')
      .addSelect(`COUNT(*)::int`, 'payoutsCount')
      .where(`p.status = :s`, { s: AgentPayoutStatus.SUCCEEDED })
      .andWhere(`p.currency = :ngn`, { ngn: 'NGN' })
      .andWhere(`p."paidAt" BETWEEN :from AND :to`, { from, to })
      .getRawOne<{ amountNgn: string; payoutsCount: string }>();
    return {
      amountNgn: Number(row?.amountNgn ?? 0),
      payoutsCount: Number(row?.payoutsCount ?? 0),
    };
  }

  /** Top N agents by commission earned in the window. */
  async topAgents(
    from: Date,
    to: Date,
    limit = 5,
  ): Promise<
    Array<{
      agentId: string;
      code: string;
      name: string;
      ordersCount: number;
      commissionNgn: number;
    }>
  > {
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
        statuses: [AgentAttributionStatus.EARNED, AgentAttributionStatus.PAID],
      })
      .andWhere(`a.currency = :ngn`, { ngn: 'NGN' })
      .andWhere(`a."earnedAt" BETWEEN :from AND :to`, { from, to })
      .groupBy('a."agentId"')
      .addGroupBy('m.code')
      .addGroupBy('u."firstName"')
      .addGroupBy('u."lastName"')
      .orderBy('SUM(a."commissionMinor")', 'DESC')
      .limit(limit)
      .getRawMany<{
        agentId: string;
        code: string;
        name: string;
        ordersCount: string;
        commissionNgn: string;
      }>();
    return rows.map((r) => ({
      agentId: r.agentId,
      code: r.code,
      name: r.name,
      ordersCount: Number(r.ordersCount),
      commissionNgn: Number(r.commissionNgn),
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // Expenses
  // ─────────────────────────────────────────────────────────────

  async expensesTotalNgn(
    from: Date,
    to: Date,
  ): Promise<{
    amountNgn: number;
    count: number;
    byCategory: Array<{ category: ExpenseCategory; amountNgn: number; count: number }>;
  }> {
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
      .getRawOne<{ amountNgn: string; count: string }>();

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
      .getRawMany<{ category: ExpenseCategory; amountNgn: string; count: string }>();

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

  async listExpenses(opts: {
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
  }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const qb = this.expenseRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.createdByUser', 'u')
      .orderBy('e."incurredAt"', 'DESC')
      .addOrderBy('e."createdAt"', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (!opts.includeDeleted) qb.andWhere(`e."deletedAt" IS NULL`);
    if (opts.category) qb.andWhere(`e.category = :c`, { c: opts.category });
    if (opts.from) qb.andWhere(`e."incurredAt" >= :from`, { from: opts.from });
    if (opts.to) qb.andWhere(`e."incurredAt" <= :to`, { to: opts.to });
    if (opts.search) {
      const s = `%${opts.search}%`;
      qb.andWhere(
        new Brackets((b) => {
          b.where('e.title ILIKE :s', { s })
            .orWhere('e.vendor ILIKE :s', { s })
            .orWhere('e."referenceNumber" ILIKE :s', { s });
        }),
      );
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createExpense(
    actor: User,
    input: {
      title: string;
      category: ExpenseCategory;
      amountMinor: number;
      incurredAt: string;
      notes?: string;
      vendor?: string;
      referenceNumber?: string;
    },
  ): Promise<Expense> {
    if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
      throw new BadRequestException(
        'Amount must be a positive integer in minor units (kobo).',
      );
    }
    const incurredAt = new Date(input.incurredAt);
    if (isNaN(incurredAt.getTime())) {
      throw new BadRequestException('Invalid incurredAt date.');
    }
    return this.dataSource.transaction(async (manager) => {
      const expense = manager.create(Expense, {
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
      const saved = await manager.save(Expense, expense);
      await this.writeAudit(manager, actor, {
        action: AccountingAuditAction.EXPENSE_CREATED,
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

  async updateExpense(
    actor: User,
    id: string,
    patch: Partial<{
      title: string;
      category: ExpenseCategory;
      amountMinor: number;
      incurredAt: string;
      notes: string | null;
      vendor: string | null;
      referenceNumber: string | null;
    }>,
  ): Promise<Expense> {
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(Expense, {
        where: { id, deletedAt: IsNull() },
      });
      if (!existing)
        throw new NotFoundException(`Expense ${id} not found or deleted`);
      const before = {
        title: existing.title,
        category: existing.category,
        amountMinor: Number(existing.amountMinor),
        incurredAt: this.toIsoDate(existing.incurredAt),
        notes: existing.notes ?? null,
        vendor: existing.vendor ?? null,
        referenceNumber: existing.referenceNumber ?? null,
      };

      if (patch.title !== undefined) existing.title = patch.title.trim();
      if (patch.category !== undefined) existing.category = patch.category;
      if (patch.amountMinor !== undefined) {
        if (!Number.isFinite(patch.amountMinor) || patch.amountMinor <= 0) {
          throw new BadRequestException('amountMinor must be positive');
        }
        existing.amountMinor = Math.round(patch.amountMinor);
      }
      if (patch.incurredAt !== undefined) {
        const d = new Date(patch.incurredAt);
        if (isNaN(d.getTime()))
          throw new BadRequestException('Invalid incurredAt');
        existing.incurredAt = d;
      }
      if (patch.notes !== undefined) existing.notes = patch.notes?.trim() || null;
      if (patch.vendor !== undefined)
        existing.vendor = patch.vendor?.trim() || null;
      if (patch.referenceNumber !== undefined)
        existing.referenceNumber = patch.referenceNumber?.trim() || null;
      existing.updatedBy = actor.id;

      const saved = await manager.save(Expense, existing);
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
        action: AccountingAuditAction.EXPENSE_UPDATED,
        entityType: 'expense',
        entityId: saved.id,
        payload: { before, after },
      });
      return saved;
    });
  }

  async deleteExpense(actor: User, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(Expense, {
        where: { id, deletedAt: IsNull() },
      });
      if (!existing) throw new NotFoundException(`Expense ${id} not found`);
      await manager.softDelete(Expense, id);
      await this.writeAudit(manager, actor, {
        action: AccountingAuditAction.EXPENSE_DELETED,
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

  async restoreExpense(actor: User, id: string): Promise<Expense> {
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(Expense, {
        where: { id, deletedAt: Not(IsNull()) },
        withDeleted: true,
      });
      if (!existing)
        throw new NotFoundException(`Expense ${id} not found or not deleted`);
      await manager.restore(Expense, id);
      await this.writeAudit(manager, actor, {
        action: AccountingAuditAction.EXPENSE_RESTORED,
        entityType: 'expense',
        entityId: id,
        payload: { title: existing.title },
      });
      const restored = await manager.findOne(Expense, { where: { id } });
      return restored!;
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Dashboard + report composer
  // ─────────────────────────────────────────────────────────────

  /**
   * Full P&L for the window. Numbers in minor units (kobo). Fires the
   * underlying queries in parallel; net profit is computed in this
   * service so the UI cannot accidentally use a stale or different
   * definition.
   */
  async pnl(
    fromInput?: string | Date,
    toInput?: string | Date,
  ): Promise<{
    range: { from: string; to: string };
    revenueNgn: number;
    grossProfit: { profitNgn: number; itemsCosted: number; itemsTotal: number };
    refunds: { amountNgn: number; itemsCount: number; requestsCount: number };
    commissions: { amountNgn: number; ordersCount: number };
    payoutsDisbursed: { amountNgn: number; payoutsCount: number };
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
  }> {
    const { from, to } = this.toRange(fromInput, toInput);
    const [
      revenueNgn,
      grossProfit,
      refunds,
      commissions,
      payoutsDisbursed,
      expenses,
    ] = await Promise.all([
      this.revenueTotalNgn(from, to),
      this.grossProfitNgn(from, to),
      this.refundsTotalNgn(from, to),
      this.commissionsEarnedNgn(from, to),
      this.payoutsDisbursedNgn(from, to),
      this.expensesTotalNgn(from, to),
    ]);
    const netProfitNgn =
      grossProfit.profitNgn -
      refunds.amountNgn -
      commissions.amountNgn -
      expenses.amountNgn;
    return {
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      revenueNgn,
      grossProfit,
      refunds,
      commissions,
      payoutsDisbursed,
      expenses,
      netProfitNgn,
    };
  }

  /**
   * Dashboard summary — current window + the same-length prior window
   * for delta arrows + top agents + revenue trend + expense trend.
   */
  async dashboard(
    fromInput?: string | Date,
    toInput?: string | Date,
  ): Promise<{
    current: Awaited<ReturnType<AccountingService['pnl']>>;
    previous: Awaited<ReturnType<AccountingService['pnl']>>;
    topAgents: Awaited<ReturnType<AccountingService['topAgents']>>;
    revenueSeries: SeriesPoint[];
    expenseSeries: SeriesPoint[];
  }> {
    const { from, to } = this.toRange(fromInput, toInput);
    const span = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - span);
    const prevTo = new Date(from.getTime());
    const [current, previous, topAgents, revenueSeries, expenseSeries] =
      await Promise.all([
        this.pnl(from, to),
        this.pnl(prevFrom, prevTo),
        this.topAgents(from, to),
        this.revenueSeries(from, to),
        this.expenseSeries(from, to),
      ]);
    return { current, previous, topAgents, revenueSeries, expenseSeries };
  }

  /** Day-level revenue series, NGN minor units. Empty buckets stay zero. */
  async revenueSeries(from: Date, to: Date): Promise<SeriesPoint[]> {
    const rows = await this.orderRepo
      .createQueryBuilder('o')
      .select(`DATE(o."paidAt")`, 'date')
      .addSelect(`COALESCE(SUM(o."grandTotal"), 0)::bigint`, 'amountNgn')
      .where(`o.currency = :ngn`, { ngn: 'NGN' })
      .andWhere(
        `o.status IN (:...statuses)`,
        {
          statuses: [
            OrderStatus.PAID,
            OrderStatus.PROCESSING,
            OrderStatus.SHIPPED,
            OrderStatus.DELIVERED,
            OrderStatus.RETURN_REQUESTED,
            OrderStatus.RETURN_APPROVED,
            OrderStatus.RETURNED,
            OrderStatus.REFUNDED,
          ],
        },
      )
      .andWhere(`o."paidAt" BETWEEN :from AND :to`, { from, to })
      .groupBy(`DATE(o."paidAt")`)
      .orderBy(`DATE(o."paidAt")`, 'ASC')
      .getRawMany<{ date: Date | string; amountNgn: string }>();
    return this.fillSeries(rows, from, to);
  }

  /** Day-level expense series. */
  async expenseSeries(from: Date, to: Date): Promise<SeriesPoint[]> {
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
      .getRawMany<{ date: Date | string; amountNgn: string }>();
    return this.fillSeries(rows, from, to);
  }

  // ─────────────────────────────────────────────────────────────
  // Audit log
  // ─────────────────────────────────────────────────────────────

  async listAuditLog(opts: {
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
  }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 30));
    const qb = this.auditRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.actor', 'u')
      .orderBy('a."createdAt"', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (opts.action) qb.andWhere(`a.action = :ac`, { ac: opts.action });
    if (opts.entityType)
      qb.andWhere(`a."entityType" = :et`, { et: opts.entityType });
    if (opts.from)
      qb.andWhere(`a."createdAt" >= :from`, { from: new Date(opts.from) });
    if (opts.to) qb.andWhere(`a."createdAt" <= :to`, { to: new Date(opts.to) });
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async logExport(actor: User, opts: { kind: string; range: { from: string; to: string } }) {
    await this.writeAudit(this.dataSource.manager, actor, {
      action: AccountingAuditAction.REPORT_EXPORTED,
      entityType: 'report',
      payload: opts as unknown as Record<string, unknown>,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────

  private async writeAudit(
    manager: import('typeorm').EntityManager,
    actor: User,
    entry: {
      action: AccountingAuditAction;
      entityType: string;
      entityId?: string;
      payload?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    await manager.save(
      AccountingAuditLog,
      manager.create(AccountingAuditLog, {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        actorId: actor.id,
        actorLabel:
          `${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim() ||
          actor.email,
        payload: entry.payload ?? null,
      }),
    );
  }

  private toIsoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private fillSeries(
    rows: Array<{ date: Date | string; amountNgn: string }>,
    from: Date,
    to: Date,
  ): SeriesPoint[] {
    const byKey = new Map<string, number>();
    for (const r of rows) {
      const key =
        r.date instanceof Date
          ? this.toIsoDate(r.date)
          : String(r.date).slice(0, 10);
      byKey.set(key, Number(r.amountNgn));
    }
    const out: SeriesPoint[] = [];
    const cursor = new Date(this.toIsoDate(from));
    const end = new Date(this.toIsoDate(to));
    while (cursor <= end) {
      const key = this.toIsoDate(cursor);
      out.push({ date: key, amountNgn: byKey.get(key) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }
}
