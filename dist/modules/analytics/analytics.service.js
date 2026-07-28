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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const order_entity_1 = require("../orders/entities/order.entity");
const product_entity_1 = require("../products/entities/product.entity");
const user_entity_1 = require("../users/entities/user.entity");
const inventory_entity_1 = require("../inventory/entities/inventory.entity");
const refunds_service_1 = require("../refunds/refunds.service");
const REVENUE_STATUSES = [
    order_entity_1.OrderStatus.PAID,
    order_entity_1.OrderStatus.PROCESSING,
    order_entity_1.OrderStatus.SHIPPED,
    order_entity_1.OrderStatus.DELIVERED,
];
const LOW_STOCK_THRESHOLD = 10;
const TOP_PRODUCTS_LIMIT = 8;
const STATUS_BREAKDOWN_LIMIT = 10;
function rangeConfig(range) {
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
let AnalyticsService = class AnalyticsService {
    constructor(orders, orderItems, products, variants, users, stockLevels, refundsService) {
        this.orders = orders;
        this.orderItems = orderItems;
        this.products = products;
        this.variants = variants;
        this.users = users;
        this.stockLevels = stockLevels;
        this.refundsService = refundsService;
    }
    async getSummary(range) {
        const cfg = rangeConfig(range);
        const now = new Date();
        const windowStart = new Date(now.getTime() - cfg.days * 24 * 60 * 60 * 1000);
        const prevWindowStart = new Date(windowStart.getTime() - cfg.days * 24 * 60 * 60 * 1000);
        const [revenueCurrent, revenuePrev, orderCountCurrent, orderCountPrev, newCustomersCurrent, newCustomersPrev, totalProducts, lowStockCount, pendingOrders, profitCurrent, profitPrev, refundsCurrent, refundsPrev, trend, topProducts, statusBreakdown, channelBreakdown, customerTrend,] = await Promise.all([
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
    async profitTotals(from, to) {
        const row = await this.orderItems
            .createQueryBuilder('oi')
            .innerJoin('orders', 'o', 'o.id = oi."orderId"')
            .leftJoin('product_variants', 'v', 'v.id = oi."variantId"')
            .select(`COALESCE(SUM(
           CASE WHEN o.currency = 'NGN'
             THEN (oi."unitPrice" - COALESCE(v."costPriceNgn", oi."unitPrice")) * oi.quantity
             ELSE 0 END
         ), 0)`, 'profit')
            .addSelect(`COUNT(*) FILTER (WHERE v."costPriceNgn" IS NOT NULL AND o.currency = 'NGN')`, 'costed')
            .addSelect(`COUNT(*) FILTER (WHERE o.currency = 'NGN')`, 'total')
            .where('o.status IN (:...statuses)', { statuses: REVENUE_STATUSES })
            .andWhere('o."createdAt" >= :from AND o."createdAt" < :to', { from, to })
            .getRawOne();
        return {
            profitNgn: Number(row?.profit ?? 0),
            itemsCosted: Number(row?.costed ?? 0),
            itemsTotal: Number(row?.total ?? 0),
        };
    }
    async revenueTotals(from, to) {
        const row = await this.orders
            .createQueryBuilder('o')
            .select(`COALESCE(SUM(CASE WHEN o.currency = 'NGN' THEN o."grandTotal" ELSE 0 END), 0)`, 'ngn')
            .addSelect(`COALESCE(SUM(CASE WHEN o.currency = 'USD' THEN o."grandTotal" ELSE 0 END), 0)`, 'usd')
            .where('o.status IN (:...statuses)', { statuses: REVENUE_STATUSES })
            .andWhere('o."createdAt" >= :from AND o."createdAt" < :to', { from, to })
            .getRawOne();
        return {
            ngn: Number(row?.ngn ?? 0),
            usd: Number(row?.usd ?? 0),
        };
    }
    async orderCount(from, to) {
        return this.orders
            .createQueryBuilder('o')
            .where('o.status IN (:...statuses)', { statuses: REVENUE_STATUSES })
            .andWhere('o."createdAt" >= :from AND o."createdAt" < :to', { from, to })
            .getCount();
    }
    async newCustomerCount(from, to) {
        return this.users
            .createQueryBuilder('u')
            .where('u.role = :role', { role: user_entity_1.UserRole.CUSTOMER })
            .andWhere('u."createdAt" >= :from AND u."createdAt" < :to', { from, to })
            .getCount();
    }
    async totalActiveProducts() {
        return this.products
            .createQueryBuilder('p')
            .where('p."isActive" = true')
            .andWhere('p."deletedAt" IS NULL')
            .getCount();
    }
    async lowStockCount() {
        const row = await this.stockLevels
            .createQueryBuilder('sl')
            .select('COUNT(*)', 'count')
            .where('(sl."onHand" - sl."reserved") <= :t', { t: LOW_STOCK_THRESHOLD })
            .andWhere('sl."onHand" > 0')
            .getRawOne();
        return Number(row?.count ?? 0);
    }
    async pendingOrderCount() {
        return this.orders
            .createQueryBuilder('o')
            .where('o.status IN (:...statuses)', {
            statuses: [order_entity_1.OrderStatus.PENDING_PAYMENT, order_entity_1.OrderStatus.PAID, order_entity_1.OrderStatus.PROCESSING],
        })
            .getCount();
    }
    async revenueTrend(from, to, truncUnit) {
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
            .getRawMany();
        return rows;
    }
    async topProducts(from, to) {
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
            .getRawMany();
        return rows.map((r) => ({
            productName: r.productName,
            sku: r.sku,
            unitsSold: Number(r.unitsSold),
            revenueNgn: Number(r.revenueNgn),
            revenueUsd: Number(r.revenueUsd),
        }));
    }
    async statusBreakdown(from, to) {
        const rows = await this.orders
            .createQueryBuilder('o')
            .select('o.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .where('o."createdAt" >= :from AND o."createdAt" < :to', { from, to })
            .andWhere('o.status != :draft', { draft: order_entity_1.OrderStatus.DRAFT })
            .groupBy('o.status')
            .orderBy('COUNT(*)', 'DESC')
            .limit(STATUS_BREAKDOWN_LIMIT)
            .getRawMany();
        return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
    }
    async channelBreakdown(from, to) {
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
            .getRawMany();
        return rows.map((r) => ({
            channel: r.channel,
            count: Number(r.count),
            revenueNgn: Number(r.revenueNgn),
            revenueUsd: Number(r.revenueUsd),
        }));
    }
    async customerTrend(from, to, truncUnit) {
        return this.users
            .createQueryBuilder('u')
            .select(`date_trunc('${truncUnit}', u."createdAt")`, 'bucket')
            .addSelect('COUNT(*)', 'count')
            .where('u.role = :role', { role: user_entity_1.UserRole.CUSTOMER })
            .andWhere('u."createdAt" >= :from AND u."createdAt" < :to', { from, to })
            .groupBy('bucket')
            .orderBy('bucket', 'ASC')
            .getRawMany();
    }
    fillTrendGaps(rows, from, to, cfg) {
        const map = new Map();
        for (const r of rows) {
            const key = this.bucketKey(new Date(r.bucket), cfg.truncUnit);
            map.set(key, { ngn: Number(r.ngn), usd: Number(r.usd), orders: Number(r.orders) });
        }
        const result = [];
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
    fillCustomerTrendGaps(rows, from, to, cfg) {
        const map = new Map();
        for (const r of rows) {
            map.set(this.bucketKey(new Date(r.bucket), cfg.truncUnit), Number(r.count));
        }
        const result = [];
        for (const b of this.enumerateBuckets(from, to, cfg)) {
            const key = this.bucketKey(b, cfg.truncUnit);
            result.push({ date: key, count: map.get(key) ?? 0 });
        }
        return result;
    }
    enumerateBuckets(from, to, cfg) {
        const buckets = [];
        if (cfg.truncUnit === 'day') {
            const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
            for (let i = 0; i < cfg.buckets; i++) {
                const d = new Date(start);
                d.setUTCDate(start.getUTCDate() + i);
                if (d >= to)
                    break;
                buckets.push(d);
            }
        }
        else {
            const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
            for (let i = 0; i < cfg.buckets; i++) {
                const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
                if (d >= to)
                    break;
                buckets.push(d);
            }
        }
        return buckets;
    }
    bucketKey(d, unit) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        if (unit === 'month')
            return `${y}-${m}-01`;
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(1, (0, typeorm_1.InjectRepository)(order_entity_1.OrderItem)),
    __param(2, (0, typeorm_1.InjectRepository)(product_entity_1.Product)),
    __param(3, (0, typeorm_1.InjectRepository)(product_entity_1.ProductVariant)),
    __param(4, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(5, (0, typeorm_1.InjectRepository)(inventory_entity_1.StockLevel)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        refunds_service_1.RefundsService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map