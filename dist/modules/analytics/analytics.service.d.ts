import { Repository } from 'typeorm';
import { Order, OrderItem, OrderStatus } from '../orders/entities/order.entity';
import { Product, ProductVariant } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { StockLevel } from '../inventory/entities/inventory.entity';
import { RefundsService } from '../refunds/refunds.service';
export type AnalyticsRange = '7d' | '30d' | '90d' | '12m';
interface TrendPoint {
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
        profitNgn: number;
        profitNgnPrev: number;
        profitItemsCosted: number;
        profitItemsTotal: number;
        refundedNgn: number;
        refundedNgnPrev: number;
        refundedItemsCount: number;
        refundedRequestsCount: number;
        promotionsNgn: number;
        promotionsUsd: number;
        promotionsNgnPrev: number;
        promotionsCouponNgn: number;
        promotionsManualNgn: number;
        promotionsDiscountedOrders: number;
    };
    trend: TrendPoint[];
    topProducts: Array<{
        productName: string;
        sku: string;
        unitsSold: number;
        revenueNgn: number;
        revenueUsd: number;
    }>;
    statusBreakdown: Array<{
        status: OrderStatus;
        count: number;
    }>;
    channelBreakdown: Array<{
        channel: string;
        count: number;
        revenueNgn: number;
        revenueUsd: number;
    }>;
    promotionChannelBreakdown: Array<{
        channel: string;
        amountNgn: number;
        amountUsd: number;
        orders: number;
    }>;
    customerTrend: Array<{
        date: string;
        count: number;
    }>;
}
export declare class AnalyticsService {
    private readonly orders;
    private readonly orderItems;
    private readonly products;
    private readonly variants;
    private readonly users;
    private readonly stockLevels;
    private readonly refundsService;
    constructor(orders: Repository<Order>, orderItems: Repository<OrderItem>, products: Repository<Product>, variants: Repository<ProductVariant>, users: Repository<User>, stockLevels: Repository<StockLevel>, refundsService: RefundsService);
    getSummary(range: AnalyticsRange): Promise<AnalyticsSummary>;
    private profitTotals;
    private revenueTotals;
    private promotionTotals;
    private promotionChannelBreakdown;
    private orderCount;
    private newCustomerCount;
    private totalActiveProducts;
    private lowStockCount;
    private pendingOrderCount;
    private revenueTrend;
    private topProducts;
    private statusBreakdown;
    private channelBreakdown;
    private customerTrend;
    private fillTrendGaps;
    private fillCustomerTrendGaps;
    private enumerateBuckets;
    private bucketKey;
}
export {};
