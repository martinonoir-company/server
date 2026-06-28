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
import { SALES_TAX_RATE } from '../products/tax.util';

/** Shared shape: a single bucket on a series (day / week / month). */
export interface SeriesPoint {
  /** ISO date for the bucket start. */
  date: string;
  /** Value in NGN minor units (kobo). */
  amountNgn: number;
}

/**
 * Accounting roll-ups, rebased on NET-OF-TAX figures.
 *
 * Pricing rule (see products/tax.util.ts): the catalog selling price is
 * stored TAX-INCLUSIVE (entered price × 1.075). Every order, refund,
 * and agent-attribution figure that flows from those prices is therefore
 * gross of VAT. For regulatory reporting we want NET (post-VAT) numbers
 * so net revenue, output VAT, net gross profit and net profit line up
 * with what an FIRS filing expects.
 *
 * The split rule, applied in one place (splitVat) and reused everywhere:
 *   netMinor = round(grossMinor / (1 + SALES_TAX_RATE))
 *   vatMinor = grossMinor − netMinor
 * Rounding is to the nearest kobo and net+vat always reconciles to gross
 * by construction (no banker's-rounding drift across totals).
 *
 * Source of truth per figure:
 *   - Gross revenue   ← SUM(orders.grandTotal) on paid orders.
 *   - Net revenue     ← splitVat(grossRevenue).net
 *   - Output VAT      ← splitVat(grossRevenue).vat
 *   - Refunds         ← SUM(refund_requests.amount) on settled refunds.
 *                       Customer is refunded the GROSS amount they paid,
 *                       so the VAT portion is also refunded — netRefunds
 *                       and vatRefunds are derived the same way.
 *   - Commissions     ← floor(orderTotal × bps / 10_000). The bps is
 *                       applied to the gross order total at attribution
 *                       time (snapshotted on agent_attributions.bps), so
 *                       the commission line on the books is already
 *                       fixed. For reporting we ALSO compute the share
 *                       that arose from net vs. VAT — informational only,
 *                       does not change what the agent is paid.
 *   - Gross profit    ← (unitPrice − costPriceNgn) × qty, summed.
 *                       unitPrice is tax-inclusive but costPriceNgn is
 *                       NOT (see products/tax.util.ts), so this figure
 *                       is overstated by the VAT in the selling price.
 *                       The net gross profit deducts that VAT:
 *                         netGrossProfit = grossProfit − vatOnRevenue
 *                                        = (netRevenue − cogs)
 *                       In effect we compare cost to NET selling price.
 *   - Payouts disbursed ← SUM(agent_payouts.amountMinor) on SUCCEEDED.
 *                          These pay out commissions that are already
 *                          fixed; we do not split them.
 *   - Expenses        ← SUM(expenses.amountMinor) — manually entered.
 *                       Treated as VAT-exclusive (no input-VAT handling
 *                       in MVP). Net = gross.
 *
 * Net profit (the dashboard headline) is computed once, from net inputs:
 *   netProfit = netGrossProfit − netRefunds − commissionsEarned − expenses
 *
 * The Vat Roll-Up surface (vatReport()) returns output VAT (collected)
 * minus refunded VAT (which leaves the business) for the window — the
 * shape an FIRS filing needs.
 *
 * Money is bigint kobo throughout. The service NEVER converts to naira.
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

  // ─────────────────────────────────────────────────────────────
  // VAT split — the ONE place we extract VAT from a tax-inclusive
  // figure. Reused by every report. Rounding policy: round-half-up to
  // nearest kobo on the net portion, then derive VAT by subtraction so
  // net + vat reconciles to the original gross exactly. There can be a
  // ±1 kobo difference on a single row; aggregated SUMs use this same
  // rule so the totals match the line items.
  //
  // Inverse of products/tax.util.ts:addSalesTax.
  // ─────────────────────────────────────────────────────────────
  private splitVat(grossMinor: number): { netMinor: number; vatMinor: number } {
    if (!Number.isFinite(grossMinor) || grossMinor <= 0) {
      return { netMinor: 0, vatMinor: 0 };
    }
    const netMinor = Math.round(grossMinor / (1 + SALES_TAX_RATE));
    const vatMinor = grossMinor - netMinor;
    return { netMinor, vatMinor };
  }

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
   * Recognised revenue from WHOLESALE orders only (same recognition rule
   * and window as revenueTotalNgn, restricted to orders.isWholesale). Mirrors
   * the normal revenue card so the admin accounting page can show wholesale
   * sales alongside total sales. Returns the revenue plus the order count.
   */
  async wholesaleRevenueTotalNgn(
    from: Date,
    to: Date,
  ): Promise<{ amountNgn: number; ordersCount: number }> {
    const row = await this.orderRepo
      .createQueryBuilder('o')
      .select(`COALESCE(SUM(o."grandTotal"), 0)::bigint`, 'total')
      .addSelect(`COUNT(*)::int`, 'count')
      .where(`o.currency = :ngn`, { ngn: 'NGN' })
      .andWhere(`o."isWholesale" = true`)
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
      .getRawOne<{ total: string; count: string }>();
    return {
      amountNgn: Number(row?.total ?? 0),
      ordersCount: Number(row?.count ?? 0),
    };
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
      // Gross profit per line:
      //   (unitPrice × qty) − discountAmount − (cost × qty)
      // discountAmount sits on OrderItem and is populated by the
      // auto-apply pricing engine. Subtracting it here keeps gross
      // profit honest when a variant-scoped promotion is active.
      // GREATEST(...,0) is a defensive floor so a mis-tagged cost
      // can't drive a line negative.
      .select(
        `COALESCE(SUM(GREATEST(0, (oi."unitPrice" * oi.quantity) - COALESCE(oi."discountAmount", 0) - COALESCE(v."costPriceNgn", 0) * oi.quantity)), 0)::bigint`,
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
    // NOTE: order-by columns are referenced via the entity-alias
    // property form (e.incurredAt) NOT the quoted SQL identifier
    // (e."incurredAt"). When combined with skip/take, TypeORM rewrites
    // the SELECT and tries to parse each orderBy expression back to a
    // column on its EntityMetadata; the quoted form trips its tokenizer
    // and explodes inside createOrderByCombinedWithSelectExpression
    // with `Cannot read properties of undefined (reading 'databaseName')`.
    const qb = this.expenseRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.createdByUser', 'u')
      .orderBy('e.incurredAt', 'DESC')
      .addOrderBy('e.createdAt', 'DESC')
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
    /** Sales-tax rate the figures were split on (e.g. 0.075). */
    salesTaxRate: number;
    /** Tax-inclusive sales receipts. Equal to SUM(orders.grandTotal). */
    grossRevenueNgn: number;
    /** Revenue net of VAT — the figure that flows through the P&L. */
    netRevenueNgn: number;
    /** Output VAT collected = grossRevenueNgn − netRevenueNgn. */
    vatOnRevenueNgn: number;
    /**
     * Gross-profit math. `grossProfitNgn` is the legacy figure
     * (unitPrice − costPriceNgn) × qty — overstated by the VAT in the
     * selling price. `netGrossProfitNgn` is the correct net figure
     * (netRevenue − cogs) and is what the P&L uses.
     */
    grossProfit: {
      grossProfitNgn: number;
      netGrossProfitNgn: number;
      cogsNgn: number;
      itemsCosted: number;
      itemsTotal: number;
    };
    /**
     * Refunds split. `grossAmountNgn` is what the customer received back
     * (matches the refund_requests.amount column); netAmountNgn is the
     * revenue side reversal; vatAmountNgn is the VAT we must reclaim.
     */
    refunds: {
      grossAmountNgn: number;
      netAmountNgn: number;
      vatAmountNgn: number;
      itemsCount: number;
      requestsCount: number;
    };
    /**
     * Wholesale sales card. Recognised revenue from orders flagged
     * wholesale (subset of grossRevenueNgn), with a net-of-VAT figure and
     * the order count — mirrors the normal revenue card for the admin page.
     */
    wholesale: {
      grossRevenueNgn: number;
      netRevenueNgn: number;
      ordersCount: number;
    };
    /** Agent commissions are unchanged — they are a settled liability. */
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
    /** netGrossProfit − netRefunds − commissions − expenses */
    netProfitNgn: number;
  }> {
    const { from, to } = this.toRange(fromInput, toInput);
    const [
      grossRevenueNgn,
      grossProfitRaw,
      refundsRaw,
      commissions,
      payoutsDisbursed,
      expenses,
      wholesaleRaw,
    ] = await Promise.all([
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

    // Net gross profit = grossProfit − VAT-on-revenue.
    // Equivalently = netRevenue − cogs. cogs is derived so it stays
    // exactly consistent: cogs = grossRevenue − grossProfit.
    const cogsNgn = grossRevenueNgn - grossProfitRaw.profitNgn;
    const netGrossProfitNgn = revenueSplit.netMinor - cogsNgn;

    const netProfitNgn =
      netGrossProfitNgn -
      refundsSplit.netMinor -
      commissions.amountNgn -
      expenses.amountNgn;

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      salesTaxRate: SALES_TAX_RATE,
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
    // See listExpenses note: orderBy must use the entity-alias property
    // form, not the quoted SQL identifier, or skip/take + orderBy will
    // crash inside TypeORM's createOrderByCombinedWithSelectExpression.
    const qb = this.auditRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.actor', 'u')
      .orderBy('a.createdAt', 'DESC')
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
  // VAT report — what an FIRS filing needs
  // ─────────────────────────────────────────────────────────────

  /**
   * VAT roll-up for the window. Built from the same source data as the
   * P&L, so a filing can be reconciled directly against revenue and
   * refunds in the P&L.
   *
   *   outputVat   — VAT collected on sales (the 7.5% portion of revenue).
   *   refundedVat — VAT given back to customers (the 7.5% portion of
   *                 refunded amounts). These reduce VAT payable for the
   *                 period.
   *   inputVat    — VAT on expenses. The MVP tracks expenses as
   *                 VAT-exclusive, so this is always 0. The shape is
   *                 here so the column is wired when input VAT capture
   *                 is added later.
   *   netVatPayable = outputVat − refundedVat − inputVat
   */
  async vatReport(
    fromInput?: string | Date,
    toInput?: string | Date,
  ): Promise<{
    range: { from: string; to: string };
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
    inputVat: { amountNgn: number; expensesCount: number };
    netVatPayableNgn: number;
  }> {
    const { from, to } = this.toRange(fromInput, toInput);

    // Revenue side — same statuses + same paidAt window as
    // revenueTotalNgn so the two reports cannot disagree.
    const revRow = await this.orderRepo
      .createQueryBuilder('o')
      .select(`COALESCE(SUM(o."grandTotal"), 0)::bigint`, 'gross')
      .addSelect(`COUNT(*)::int`, 'orders')
      .where(`o.currency = :ngn`, { ngn: 'NGN' })
      .andWhere(`o.status IN (:...statuses)`, {
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
      })
      .andWhere(`o."paidAt" BETWEEN :from AND :to`, { from, to })
      .getRawOne<{ gross: string; orders: string }>();
    const grossRev = Number(revRow?.gross ?? 0);
    const revSplit = this.splitVat(grossRev);

    // Refund side.
    const refRow = await this.refundRepo
      .createQueryBuilder('r')
      .select(`COALESCE(SUM(r.amount), 0)::bigint`, 'gross')
      .addSelect(`COUNT(*)::int`, 'reqs')
      .where(`r.status IN (:...statuses)`, {
        statuses: [RefundStatus.SUCCEEDED, RefundStatus.COMPLETED_BY_STAFF],
      })
      .andWhere(`r.currency = :ngn`, { ngn: 'NGN' })
      .andWhere(`r."createdAt" BETWEEN :from AND :to`, { from, to })
      .getRawOne<{ gross: string; reqs: string }>();
    const grossRef = Number(refRow?.gross ?? 0);
    const refSplit = this.splitVat(grossRef);

    // Input VAT — not captured today. Wired as zero so the shape is
    // stable; when expenses gain a VAT column the read swaps in here.
    const inputVatAmount = 0;
    const inputExpensesCount = 0;

    const netVatPayableNgn =
      revSplit.vatMinor - refSplit.vatMinor - inputVatAmount;

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      salesTaxRate: SALES_TAX_RATE,
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
