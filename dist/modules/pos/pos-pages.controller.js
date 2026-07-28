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
exports.PosPagesController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const order_entity_1 = require("../orders/entities/order.entity");
const coupon_entity_1 = require("../coupons/entities/coupon.entity");
const customers_service_1 = require("../customers/customers.service");
const inventory_service_1 = require("../inventory/inventory.service");
const inventory_entity_1 = require("../inventory/entities/inventory.entity");
const product_entity_1 = require("../products/entities/product.entity");
let PosPagesController = class PosPagesController {
    constructor(orderRepo, orderItemRepo, couponRepo, stockLevelRepo, variantRepo, customersService, inventoryService, dataSource) {
        this.orderRepo = orderRepo;
        this.orderItemRepo = orderItemRepo;
        this.couponRepo = couponRepo;
        this.stockLevelRepo = stockLevelRepo;
        this.variantRepo = variantRepo;
        this.customersService = customersService;
        this.inventoryService = inventoryService;
        this.dataSource = dataSource;
    }
    async getAnalyticsSummary(startDate, endDate, channel) {
        const qb = this.orderRepo.createQueryBuilder('o')
            .where('o.status NOT IN (:...excluded)', { excluded: [order_entity_1.OrderStatus.DRAFT, order_entity_1.OrderStatus.CANCELLED] });
        if (channel) {
            qb.andWhere('o.channel = :channel', { channel });
        }
        else {
            qb.andWhere('o.channel = :channel', { channel: order_entity_1.OrderChannel.POS });
        }
        if (startDate) {
            qb.andWhere('o.createdAt >= :start', { start: new Date(startDate) });
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            qb.andWhere('o.createdAt <= :end', { end });
        }
        const stats = await qb.clone()
            .select('COUNT(*)', 'orderCount')
            .addSelect('COALESCE(SUM(o.grandTotal), 0)', 'totalRevenue')
            .addSelect('COALESCE(SUM(o.discountTotal), 0)', 'totalDiscount')
            .addSelect('COALESCE(AVG(o.grandTotal), 0)', 'avgOrderValue')
            .getRawOne();
        const paymentBreakdown = await qb.clone()
            .select('o.paymentMethod', 'method')
            .addSelect('COUNT(*)', 'count')
            .addSelect('COALESCE(SUM(o.grandTotal), 0)', 'total')
            .groupBy('o.paymentMethod')
            .orderBy('total', 'DESC')
            .getRawMany();
        const topProducts = await this.dataSource.createQueryBuilder()
            .select('oi.productName', 'productName')
            .addSelect('oi.sku', 'sku')
            .addSelect('SUM(oi.quantity)', 'totalQty')
            .addSelect('SUM(oi.lineTotal)', 'totalRevenue')
            .from(order_entity_1.OrderItem, 'oi')
            .innerJoin(order_entity_1.Order, 'o', 'oi.orderId = o.id')
            .where('o.status NOT IN (:...excluded)', { excluded: [order_entity_1.OrderStatus.DRAFT, order_entity_1.OrderStatus.CANCELLED] })
            .andWhere(channel ? 'o.channel = :channel' : 'o.channel = :channel', { channel: channel || order_entity_1.OrderChannel.POS })
            .andWhere(startDate ? 'o.createdAt >= :start' : '1=1', startDate ? { start: new Date(startDate) } : {})
            .andWhere(endDate ? 'o.createdAt <= :end' : '1=1', endDate ? { end: (() => { const e = new Date(endDate); e.setHours(23, 59, 59, 999); return e; })() } : {})
            .groupBy('oi.productName')
            .addGroupBy('oi.sku')
            .orderBy('SUM(oi.quantity)', 'DESC')
            .limit(10)
            .getRawMany();
        const dailyRevenue = await qb.clone()
            .select("DATE(o.createdAt)", 'date')
            .addSelect('COUNT(*)', 'orders')
            .addSelect('COALESCE(SUM(o.grandTotal), 0)', 'revenue')
            .groupBy("DATE(o.createdAt)")
            .orderBy("DATE(o.createdAt)", 'ASC')
            .getRawMany();
        return {
            data: {
                orderCount: Number(stats?.orderCount || 0),
                totalRevenue: Number(stats?.totalRevenue || 0),
                totalDiscount: Number(stats?.totalDiscount || 0),
                avgOrderValue: Math.round(Number(stats?.avgOrderValue || 0)),
                paymentBreakdown: paymentBreakdown.map(p => ({
                    method: p.method || 'UNKNOWN',
                    count: Number(p.count),
                    total: Number(p.total),
                })),
                topProducts: topProducts.map(p => ({
                    productName: p.productName,
                    sku: p.sku,
                    totalQty: Number(p.totalQty),
                    totalRevenue: Number(p.totalRevenue),
                })),
                dailyRevenue: dailyRevenue.map(d => ({
                    date: d.date,
                    orders: Number(d.orders),
                    revenue: Number(d.revenue),
                })),
            },
        };
    }
    async getCoupons(page, limit, status) {
        const pg = Number(page) || 1;
        const lmt = Math.min(Number(limit) || 15, 100);
        const skip = (pg - 1) * lmt;
        const qb = this.couponRepo.createQueryBuilder('c')
            .orderBy('c.createdAt', 'DESC');
        if (status) {
            qb.andWhere('c.status = :status', { status });
        }
        qb.skip(skip).take(lmt);
        const [items, total] = await qb.getManyAndCount();
        return {
            data: {
                items,
                total,
                page: pg,
                limit: lmt,
                pages: Math.ceil(total / lmt),
            },
        };
    }
    async getCustomers(page, limit, search) {
        return {
            data: await this.customersService.findAll({
                page: Number(page) || 1,
                limit: Number(limit) || 15,
                search: search?.trim() || undefined,
                sortBy: 'createdAt',
                sortOrder: 'DESC',
            }),
        };
    }
    async getCustomer(id) {
        const customer = await this.customersService.findOne(id);
        const orders = await this.orderRepo.find({
            where: { userId: customer.userId },
            relations: ['items'],
            order: { createdAt: 'DESC' },
            take: 20,
        });
        return { data: { ...customer, recentOrders: orders } };
    }
    async getInventory(page, limit, search, lowStockOnly) {
        const pg = Number(page) || 1;
        const lmt = Math.min(Number(limit) || 20, 100);
        const skip = (pg - 1) * lmt;
        const qb = this.stockLevelRepo.createQueryBuilder('sl')
            .innerJoin(product_entity_1.ProductVariant, 'v', 'v.id = sl."variantId"')
            .innerJoin(product_entity_1.Product, 'p', 'p.id = v."productId"')
            .select([
            'sl."variantId" AS "variantId"',
            'sl."warehouseCode" AS "warehouseCode"',
            'sl."onHand" AS "onHand"',
            'sl."reserved" AS "reserved"',
            'sl."lastMovementAt" AS "lastMovementAt"',
            'v."sku" AS "sku"',
            'v."name" AS "variantName"',
            'v."barcode" AS "barcode"',
            'p."name" AS "productName"',
            'p."id" AS "productId"',
        ]);
        if (search?.trim()) {
            qb.andWhere('(p.name ILIKE :s OR v.sku ILIKE :s OR v.name ILIKE :s)', { s: `%${search.trim()}%` });
        }
        if (lowStockOnly === 'true') {
            qb.andWhere('(sl."onHand" - sl."reserved") <= 5 AND sl."onHand" > 0');
        }
        qb.orderBy('sl."lastMovementAt"', 'DESC');
        const totalQb = qb.clone();
        const total = await totalQb.getCount();
        qb.offset(skip).limit(lmt);
        const items = await qb.getRawMany();
        return {
            data: {
                items: items.map(i => ({
                    variantId: i.variantId,
                    warehouseCode: i.warehouseCode,
                    onHand: Number(i.onHand),
                    reserved: Number(i.reserved),
                    available: Number(i.onHand) - Number(i.reserved),
                    lastMovementAt: i.lastMovementAt,
                    sku: i.sku,
                    variantName: i.variantName,
                    barcode: i.barcode,
                    productName: i.productName,
                    productId: i.productId,
                })),
                total,
                page: pg,
                limit: lmt,
                pages: Math.ceil(total / lmt),
            },
        };
    }
    async getMovements(variantId, page, limit) {
        const pg = Number(page) || 1;
        const lmt = Math.min(Number(limit) || 20, 100);
        const result = await this.inventoryService.getMovementHistory(variantId, lmt, (pg - 1) * lmt);
        return {
            data: {
                items: result.items,
                total: result.total,
                page: pg,
                limit: lmt,
                pages: Math.ceil(result.total / lmt),
            },
        };
    }
};
exports.PosPagesController = PosPagesController;
__decorate([
    (0, common_1.Get)('analytics/summary'),
    __param(0, (0, common_1.Query)('startDate')),
    __param(1, (0, common_1.Query)('endDate')),
    __param(2, (0, common_1.Query)('channel')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], PosPagesController.prototype, "getAnalyticsSummary", null);
__decorate([
    (0, common_1.Get)('coupons'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String]),
    __metadata("design:returntype", Promise)
], PosPagesController.prototype, "getCoupons", null);
__decorate([
    (0, common_1.Get)('customers'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String]),
    __metadata("design:returntype", Promise)
], PosPagesController.prototype, "getCustomers", null);
__decorate([
    (0, common_1.Get)('customers/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PosPagesController.prototype, "getCustomer", null);
__decorate([
    (0, common_1.Get)('inventory'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('search')),
    __param(3, (0, common_1.Query)('lowStockOnly')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, String]),
    __metadata("design:returntype", Promise)
], PosPagesController.prototype, "getInventory", null);
__decorate([
    (0, common_1.Get)('inventory/:variantId/movements'),
    __param(0, (0, common_1.Param)('variantId')),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Number]),
    __metadata("design:returntype", Promise)
], PosPagesController.prototype, "getMovements", null);
exports.PosPagesController = PosPagesController = __decorate([
    (0, common_1.Controller)({ path: 'pos/pages', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(1, (0, typeorm_1.InjectRepository)(order_entity_1.OrderItem)),
    __param(2, (0, typeorm_1.InjectRepository)(coupon_entity_1.Coupon)),
    __param(3, (0, typeorm_1.InjectRepository)(inventory_entity_1.StockLevel)),
    __param(4, (0, typeorm_1.InjectRepository)(product_entity_1.ProductVariant)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        customers_service_1.CustomersService,
        inventory_service_1.InventoryService,
        typeorm_2.DataSource])
], PosPagesController);
//# sourceMappingURL=pos-pages.controller.js.map