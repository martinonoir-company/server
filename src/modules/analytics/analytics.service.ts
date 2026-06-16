import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderItem, OrderStatus } from '../orders/entities/order.entity';
import { Product, ProductVariant } from '../products/entities/product.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { StockLevel } from '../inventory/entities/inventory.entity';
import { RefundsService } from '../refunds/refunds.service';

export type AnalyticsRange = '7d' | '30d' | '90d' | '12m';

/**
 * Statuses that count as "revenue earned" for KPI/trend purposes.
 * Mirrors the rule used on the dashboard page: anything past PAID counts,
 * everything before it doesn't, and refunds are explicitly excluded.
 */
const REVENUE_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

const LOW_STOCK_THRESHOLD = 10;
const TOP_PRODUCTS_LIMIT = 8;
const STATUS_BREAKDOWN_LIMIT = 10;

interface RangeConfig {
  days: number;
  bucket: 'day' | 'month';
  /** Postgres date_trunc unit. */
  truncUnit: 'day' | 'month';
  /** How many buckets the chart should show. */
  buckets: number;
}

function rangeConfig(range: AnalyticsRange): RangeConfig {
  switch (range) {
    case '7d':
      return { days: 7, bucket: 'day', truncUnit: 'day', buckets: 7 };
    case '30d':
      return { days: 30, bucket: 'day', truncUnit: 'day', buckets: 30 };
    case '90d':
      return { days: 90, bucket: 'day', truncUnit: 'day', buckets: 90 };
    case '12m':
      return { days: 365, bucket: 'month', truncUnit: 'month', buckets: 12 };
  }
}

interface TrendPoint {
  /** ISO date (YYYY-MM-DD for day buckets, YYYY-MM-01 for month). */
  date: string;
  ngn: number;
  usd: number;
  orders: number;
}

interface CurrencyTotals {
  ngn: number;
  usd: number;
}

export interface AnalyticsSummary {
  range: AnalyticsRange;
  generatedAt: string;
  /** Inclusive start of the window. */
  windowStart: string;
  windowEnd: string;

  kpis: {
    revenue: CurrencyTotals;
    revenuePrev: CurrencyTotals;
    orders: number;
    ordersPrev: number;
    avgOrderValue: CurrencyTotals;
    newCustomers: number;
    newCustomersPrev: number;
    totalProducts: number;
    lowStockCount: number;
    pendingOrders: number;
    /** Realised gross profit (NGN, minor units) for the window. */
    profitNgn: number;
    profitNgnPrev: number;
    /** Sold order-items with a cost recorded / total — cost-data coverage. */
    profitItemsCosted: number;
    profitItemsTotal: number;
    /** Total refunded (NGN, minor units) inside the window. */
    refundedNgn: number;
    refundedNgnPrev: number;
    /** Physical units returned + refund requests behind that figure. */
    refundedItemsCount: number;
    refundedRequestsCount: number;
  };

  /** Daily/monthly trend for revenue + order count. Length = buckets. */
  trend: TrendPoint[];

  /** Top products by units sold inside the window. */
  topProducts: Array<{
    productName: string;
    sku: string;
    unitsSold: number;
    revenueNgn: number;
    revenueUsd: number;
  }>;

  /** Order count by status inside the window. */
  statusBreakdown: Array<{ status: OrderStatus; count: number }>;

  /** Order count by sales channel inside the window. */
  channelBreakdown: Array<{ channel: string; count: number; revenueNgn: number; revenueUsd: number }>;

  /** New-customer signups bucketed across the window. */
  customerTrend: Array<{ date: string; count: number }>;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItems: Repository<OrderItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductVariant) private readonly variants: Repository<ProductVariant>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(StockLevel) private readonly stockLevels: Repository<StockLevel>,
    private readonly refundsService: RefundsService,
  ) {}

  async getSummary(range: AnalyticsRange): Promise<AnalyticsSummary> {
    const cfg = rangeConfig(range);
    const now = new Date();
    const windowStart = new Date(now.getTime() - cfg.days * 24 * 60 * 60 * 1000);
    const prevWindowStart = new Date(windowStart.getTime() - cfg.days * 24 * 60 * 60 * 1000);

    // Fire all aggregation queries in parallel. Each is a single GROUP BY or
    // SUM in Postgres — the heavy lifting is done by the DB, never by Node.
    const [
      revenueCurrent,
      revenuePrev,
      orderCountCurrent,
      orderCountPrev,
      newCustomersCurrent,
      newCustomersPrev,
      totalProducts,
      lowStockCount,
      pendingOrders,
      profitCurrent,
      profitPrev,
      refundsCurrent,
      refundsPrev,
      trend,
      topProducts,
      statusBreakdown,
      channelBreakdown,
      customerTrend,
    ] = await Promise.all([
      this.revenueTotals(windowStart, now),
      this.revenueTotals(prevWindowStart, windowStart),
      this.orderCount(windowStart, now),
      this.orderCount(prevWindowStart, windowStart),
      this.newCustomerCount(windowStart, now),
      this.newCustomerCount(prevWindowStart, windowStart),
      this.totalActiveProducts(),
      this.lowStockCount(),
      this.pendingOrderCount(),
      this.profitTotals(windowStart, now),
      this.profitTotals(prevWindowStart, windowStart),
      this.refundsService.totalsRefunded(windowStart, now),
      this.refundsService.totalsRefunded(prevWindowStart, windowStart),
      this.revenueTrend(windowStart, now, cfg.truncUnit),
      this.topProducts(windowStart, now),
      this.statusBreakdown(windowStart, now),
      this.channelBreakdown(windowStart, now),
      this.customerTrend(windowStart, now, cfg.truncUnit),
    ]);

    // Average order value — guard against divide-by-zero.
    const aovNgn = orderCountCurrent > 0 ? Math.round(revenueCurrent.ngn / orderCountCurrent) : 0;
    const aovUsd = orderCountCurrent > 0 ? Math.round(revenueCurrent.usd / orderCountCurrent) : 0;

    return {
      range,
      generatedAt: now.toISOString(),
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
      kpis: {
        revenue: revenueCurrent,
        revenuePrev,
        orders: orderCountCurrent,
        ordersPrev: orderCountPrev,
        avgOrderValue: { ngn: aovNgn, usd: aovUsd },
        newCustomers: newCustomersCurrent,
        newCustomersPrev,
        totalProducts,
        lowStockCount,
        pendingOrders,
        profitNgn: profitCurrent.profitNgn,
        profitNgnPrev: profitPrev.profitNgn,
        profitItemsCosted: profitCurrent.itemsCosted,
        profitItemsTotal: profitCurrent.itemsTotal,
        refundedNgn: refundsCurrent.amountNgn,
        refundedNgnPrev: refundsPrev.amountNgn,
        refundedItemsCount: refundsCurrent.itemsCount,
        refundedRequestsCount: refundsCurrent.requestsCount,
      },
      trend: this.fillTrendGaps(trend, windowStart, now, cfg),
      topProducts,
      statusBreakdown,
      channelBreakdown,
      customerTrend: this.fillCustomerTrendGaps(customerTrend, windowStart, now, cfg),
    };
  }

  // ── Individual aggregations ──

  /**
   * Total realised gross profit (NGN) for the window.
   *
   * Profit = Σ over sold order-items of (sellingPrice − costPrice) × qty,
   * for orders in a revenue status. Selling price is the order item's
   * unitPrice (the tax-inclusive price actually charged); cost price is
   * the variant's costPriceNgn. Items whose variant has no cost recorded
   * contribute 0 profit — `itemsCosted` / `itemsTotal` lets the UI flag
   * how complete the cost data is. NGN only — there is no USD cost field.
   */
  private async profitTotals(
    from: Date,
    to: Date,
  ): Promise<{ profitNgn: number; itemsCosted: number; itemsTotal: number }> {
    const row = await this.orderItems
      .createQueryBuilder('oi')
      .innerJoin('orders', 'o', 'o.id = oi."orderId"')
      .leftJoin('product_variants', 'v', 'v.id = oi."variantId"')
      .select(
        // Only NGN orders; a line with no cost contributes 0 profit
        // (cost falls back to the selling price → zero margin).
        `COALESCE(SUM(
           CASE WHEN o.currency = 'NGN'
             THEN (oi."unitPrice" - COALESCE(v."costPriceNgn", oi."unitPrice")) * oi.quantity
             ELSE 0 END
         ), 0)`,
        'profit',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE v."costPriceNgn" IS NOT NULL AND o.currency = 'NGN')`,
        'costed',
      )
      .addSelect(`COUNT(*) FILTER (WHERE o.currency = 'NGN')`, 'total')
      .where('o.status IN (:...statuses)', { statuses: REVENUE_STATUSES })
      .andWhere('o."createdAt" >= :from AND o."createdAt" < :to', { from, to })
      .getRawOne<{ profit: string; costed: string; total: string }>();
    return {
      profitNgn: Number(row?.profit ?? 0),
      itemsCosted: Number(row?.costed ?? 0),
      itemsTotal: Number(row?.total ?? 0),
    };
  }

  private async revenueTotals(from: Date, to: Date): Promise<CurrencyTotals> {
    // Two SUMs in a single round-trip via CASE/FILTER.
    const row = await this.orders
      .createQueryBuilder('o')
      .select(`COALESCE(SUM(CASE WHEN o.currency = 'NGN' THEN o."grandTotal" ELSE 0 END), 0)`, 'ngn')
      .addSelect(`COALESCE(SUM(CASE WHEN o.currency = 'USD' THEN o."grandTotal" ELSE 0 END), 0)`, 'usd')
      .where('o.status IN (:...statuses)', { statuses: REVENUE_STATUSES })
      .andWhere('o."createdAt" >= :from AND o."createdAt" < :to', { from, to })
      .getRawOne<{ ngn: string; usd: string }>();
    return {
      ngn: Number(row?.ngn ?? 0),
      usd: Number(row?.usd ?? 0),
    };
  }

  private async orderCount(from: Date, to: Date): Promise<number> {
    return this.orders
      .createQueryBuilder('o')
      .where('o.status IN (:...statuses)', { statuses: REVENUE_STATUSES })
      .andWhere('o."createdAt" >= :from AND o."createdAt" < :to', { from, to })
      .getCount();
  }

  private async newCustomerCount(from: Date, to: Date): Promise<number> {
    return this.users
      .createQueryBuilder('u')
      .where('u.role = :role', { role: UserRole.CUSTOMER })
      .andWhere('u."createdAt" >= :from AND u."createdAt" < :to', { from, to })
      .getCount();
  }

  private async totalActiveProducts(): Promise<number> {
    return this.products
      .createQueryBuilder('p')
      .where('p."isActive" = true')
      .andWhere('p."deletedAt" IS NULL')
      .getCount();
  }

  private async lowStockCount(): Promise<number> {
    const row = await this.stockLevels
      .createQueryBuilder('sl')
      .select('COUNT(*)', 'count')
      .where('(sl."onHand" - sl."reserved") <= :t', { t: LOW_STOCK_THRESHOLD })
      .andWhere('sl."onHand" > 0')
      .getRawOne<{ count: string }>();
    return Number(row?.count ?? 0);
  }

  private async pendingOrderCount(): Promise<number> {
    return this.orders
      .createQueryBuilder('o')
      .where('o.status IN (:...statuses)', {
        statuses: [OrderStatus.PENDING_PAYMENT, OrderStatus.PAID, OrderStatus.PROCESSING],
      })
      .getCount();
  }

  private async revenueTrend(
    from: Date,
    to: Date,
    truncUnit: 'day' | 'month',
  ): Promise<Array<{ bucket: Date; ngn: string; usd: string; orders: string }>> {
    const rows = await this.orders
      .createQueryBuilder('o')
      .select(`date_trunc('${truncUnit}', o."createdAt")`, 'bucket')
      .addSelect(`COALESCE(SUM(CASE WHEN o.currency = 'NGN' THEN o."grandTotal" ELSE 0 END), 0)`, 'ngn')
      .addSelect(`COALESCE(SUM(CASE WHEN o.currency = 'USD' THEN o."grandTotal" ELSE 0 END), 0)`, 'usd')
      .addSelect('COUNT(*)', 'orders')
      .where('o.status IN (:...statuses)', { statuses: REVENUE_STATUSES })
      .andWhere('o."createdAt" >= :from AND o."createdAt" < :to', { from, to })
      .groupBy('bucket')
      .orderBy('bucket', 'ASC')
      .getRawMany<{ bucket: Date; ngn: string; usd: string; orders: string }>();
    return rows;
  }

  private async topProducts(from: Date, to: Date) {
    const rows = await this.orderItems
      .createQueryBuilder('oi')
      .innerJoin('orders', 'o', 'o.id = oi."orderId"')
      .select('oi."productName"', 'productName')
      .addSelect('oi.sku', 'sku')
      .addSelect('SUM(oi.quantity)', 'unitsSold')
      .addSelect(`COALESCE(SUM(CASE WHEN o.currency = 'NGN' THEN oi."lineTotal" ELSE 0 END), 0)`, 'revenueNgn')
      .addSelect(`COALESCE(SUM(CASE WHEN o.currency = 'USD' THEN oi."lineTotal" ELSE 0 END), 0)`, 'revenueUsd')
      .where('o.status IN (:...statuses)', { statuses: REVENUE_STATUSES })
      .andWhere('o."createdAt" >= :from AND o."createdAt" < :to', { from, to })
      .groupBy('oi."productName"')
      .addGroupBy('oi.sku')
      .orderBy('SUM(oi.quantity)', 'DESC')
      .limit(TOP_PRODUCTS_LIMIT)
      .getRawMany<{ productName: string; sku: string; unitsSold: string; revenueNgn: string; revenueUsd: string }>();
    return rows.map((r) => ({
      productName: r.productName,
      sku: r.sku,
      unitsSold: Number(r.unitsSold),
      revenueNgn: Number(r.revenueNgn),
      revenueUsd: Number(r.revenueUsd),
    }));
  }

  private async statusBreakdown(from: Date, to: Date) {
    const rows = await this.orders
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('o."createdAt" >= :from AND o."createdAt" < :to', { from, to })
      .andWhere('o.status != :draft', { draft: OrderStatus.DRAFT })
      .groupBy('o.status')
      .orderBy('COUNT(*)', 'DESC')
      .limit(STATUS_BREAKDOWN_LIMIT)
      .getRawMany<{ status: OrderStatus; count: string }>();
    return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
  }

  private async channelBreakdown(from: Date, to: Date) {
    const rows = await this.orders
      .createQueryBuilder('o')
      .select('o.channel', 'channel')
      .addSelect('COUNT(*)', 'count')
      .addSelect(`COALESCE(SUM(CASE WHEN o.currency = 'NGN' THEN o."grandTotal" ELSE 0 END), 0)`, 'revenueNgn')
      .addSelect(`COALESCE(SUM(CASE WHEN o.currency = 'USD' THEN o."grandTotal" ELSE 0 END), 0)`, 'revenueUsd')
      .where('o.status IN (:...statuses)', { statuses: REVENUE_STATUSES })
      .andWhere('o."createdAt" >= :from AND o."createdAt" < :to', { from, to })
      .groupBy('o.channel')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany<{ channel: string; count: string; revenueNgn: string; revenueUsd: string }>();
    return rows.map((r) => ({
      channel: r.channel,
      count: Number(r.count),
      revenueNgn: Number(r.revenueNgn),
      revenueUsd: Number(r.revenueUsd),
    }));
  }

  private async customerTrend(
    from: Date,
    to: Date,
    truncUnit: 'day' | 'month',
  ): Promise<Array<{ bucket: Date; count: string }>> {
    return this.users
      .createQueryBuilder('u')
      .select(`date_trunc('${truncUnit}', u."createdAt")`, 'bucket')
      .addSelect('COUNT(*)', 'count')
      .where('u.role = :role', { role: UserRole.CUSTOMER })
      .andWhere('u."createdAt" >= :from AND u."createdAt" < :to', { from, to })
      .groupBy('bucket')
      .orderBy('bucket', 'ASC')
      .getRawMany<{ bucket: Date; count: string }>();
  }

  // ── Gap-filling: charts need a point per bucket even when no orders happened ──

  private fillTrendGaps(
    rows: Array<{ bucket: Date; ngn: string; usd: string; orders: string }>,
    from: Date,
    to: Date,
    cfg: RangeConfig,
  ): TrendPoint[] {
    const map = new Map<string, { ngn: number; usd: number; orders: number }>();
    for (const r of rows) {
      const key = this.bucketKey(new Date(r.bucket), cfg.truncUnit);
      map.set(key, { ngn: Number(r.ngn), usd: Number(r.usd), orders: Number(r.orders) });
    }

    const result: TrendPoint[] = [];
    const buckets = this.enumerateBuckets(from, to, cfg);
    for (const b of buckets) {
      const key = this.bucketKey(b, cfg.truncUnit);
      const hit = map.get(key);
      result.push({
        date: key,
        ngn: hit?.ngn ?? 0,
        usd: hit?.usd ?? 0,
        orders: hit?.orders ?? 0,
      });
    }
    return result;
  }

  private fillCustomerTrendGaps(
    rows: Array<{ bucket: Date; count: string }>,
    from: Date,
    to: Date,
    cfg: RangeConfig,
  ) {
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(this.bucketKey(new Date(r.bucket), cfg.truncUnit), Number(r.count));
    }
    const result: Array<{ date: string; count: number }> = [];
    for (const b of this.enumerateBuckets(from, to, cfg)) {
      const key = this.bucketKey(b, cfg.truncUnit);
      result.push({ date: key, count: map.get(key) ?? 0 });
    }
    return result;
  }

  private enumerateBuckets(from: Date, to: Date, cfg: RangeConfig): Date[] {
    const buckets: Date[] = [];
    if (cfg.truncUnit === 'day') {
      // Start at the day-boundary of `from`, advance one day at a time
      // up to (but not including) `to`. UTC throughout so the bucket
      // boundaries match Postgres `date_trunc('day', ...)`.
      const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
      for (let i = 0; i < cfg.buckets; i++) {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + i);
        if (d >= to) break;
        buckets.push(d);
      }
    } else {
      // Months. Start at the 1st of (from)'s month, walk 12 months forward.
      const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
      for (let i = 0; i < cfg.buckets; i++) {
        const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
        if (d >= to) break;
        buckets.push(d);
      }
    }
    return buckets;
  }

  private bucketKey(d: Date, unit: 'day' | 'month'): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    if (unit === 'month') return `${y}-${m}-01`;
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
