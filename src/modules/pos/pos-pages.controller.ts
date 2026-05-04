import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order, OrderItem, OrderChannel, OrderStatus } from '../orders/entities/order.entity';
import { Coupon, CouponStatus } from '../coupons/entities/coupon.entity';
import { Customer } from '../customers/entities/customer.entity';
import { CustomersService } from '../customers/customers.service';
import { InventoryService } from '../inventory/inventory.service';
import { StockLevel } from '../inventory/entities/inventory.entity';
import { Product, ProductVariant } from '../products/entities/product.entity';

/**
 * POS Pages Controller — read-only endpoints for the POS staff interface.
 * Provides analytics, coupons, customers, and enriched inventory data.
 */
@Controller({ path: 'pos/pages', version: '1' })
@UseGuards(JwtAuthGuard)
export class PosPagesController {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Coupon) private readonly couponRepo: Repository<Coupon>,
    @InjectRepository(StockLevel) private readonly stockLevelRepo: Repository<StockLevel>,
    @InjectRepository(ProductVariant) private readonly variantRepo: Repository<ProductVariant>,
    private readonly customersService: CustomersService,
    private readonly inventoryService: InventoryService,
    private readonly dataSource: DataSource,
  ) {}

  // ══════════════════════════════════════════════
  //  ANALYTICS / REPORTS
  // ══════════════════════════════════════════════

  @Get('analytics/summary')
  async getAnalyticsSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('channel') channel?: string,
  ) {
    const qb = this.orderRepo.createQueryBuilder('o')
      .where('o.status NOT IN (:...excluded)', { excluded: [OrderStatus.DRAFT, OrderStatus.CANCELLED] });

    if (channel) {
      qb.andWhere('o.channel = :channel', { channel });
    } else {
      qb.andWhere('o.channel = :channel', { channel: OrderChannel.POS });
    }

    if (startDate) {
      qb.andWhere('o.createdAt >= :start', { start: new Date(startDate) });
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('o.createdAt <= :end', { end });
    }

    // Summary stats
    const stats = await qb.clone()
      .select('COUNT(*)', 'orderCount')
      .addSelect('COALESCE(SUM(o.grandTotal), 0)', 'totalRevenue')
      .addSelect('COALESCE(SUM(o.discountTotal), 0)', 'totalDiscount')
      .addSelect('COALESCE(AVG(o.grandTotal), 0)', 'avgOrderValue')
      .getRawOne();

    // Payment method breakdown
    const paymentBreakdown = await qb.clone()
      .select('o.paymentMethod', 'method')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(o.grandTotal), 0)', 'total')
      .groupBy('o.paymentMethod')
      .orderBy('total', 'DESC')
      .getRawMany();

    // Top products by quantity sold
    const topProducts = await this.dataSource.createQueryBuilder()
      .select('oi.productName', 'productName')
      .addSelect('oi.sku', 'sku')
      .addSelect('SUM(oi.quantity)', 'totalQty')
      .addSelect('SUM(oi.lineTotal)', 'totalRevenue')
      .from(OrderItem, 'oi')
      .innerJoin(Order, 'o', 'oi.orderId = o.id')
      .where('o.status NOT IN (:...excluded)', { excluded: [OrderStatus.DRAFT, OrderStatus.CANCELLED] })
      .andWhere(channel ? 'o.channel = :channel' : 'o.channel = :channel', { channel: channel || OrderChannel.POS })
      .andWhere(startDate ? 'o.createdAt >= :start' : '1=1', startDate ? { start: new Date(startDate) } : {})
      .andWhere(endDate ? 'o.createdAt <= :end' : '1=1', endDate ? { end: (() => { const e = new Date(endDate); e.setHours(23,59,59,999); return e; })() } : {})
      .groupBy('oi.productName')
      .addGroupBy('oi.sku')
      .orderBy('SUM(oi.quantity)', 'DESC')
      .limit(10)
      .getRawMany();

    // Daily revenue for chart (last 30 days)
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

  // ══════════════════════════════════════════════
  //  COUPONS / DISCOUNTS
  // ══════════════════════════════════════════════

  @Get('coupons')
  async getCoupons(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
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

  // ══════════════════════════════════════════════
  //  CUSTOMERS
  // ══════════════════════════════════════════════

  @Get('customers')
  async getCustomers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
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

  @Get('customers/:id')
  async getCustomer(@Param('id') id: string) {
    const customer = await this.customersService.findOne(id);
    // Also fetch recent orders for this customer
    const orders = await this.orderRepo.find({
      where: { userId: customer.userId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
      take: 20,
    });
    return { data: { ...customer, recentOrders: orders } };
  }

  // ══════════════════════════════════════════════
  //  INVENTORY (enriched with product names)
  // ══════════════════════════════════════════════

  @Get('inventory')
  async getInventory(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('lowStockOnly') lowStockOnly?: string,
  ) {
    const pg = Number(page) || 1;
    const lmt = Math.min(Number(limit) || 20, 100);
    const skip = (pg - 1) * lmt;

    const qb = this.stockLevelRepo.createQueryBuilder('sl')
      .innerJoin(ProductVariant, 'v', 'v.id = sl."variantId"')
      .innerJoin(Product, 'p', 'p.id = v."productId"')
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
    
    // Get total count
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

  @Get('inventory/:variantId/movements')
  async getMovements(
    @Param('variantId') variantId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
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
}
