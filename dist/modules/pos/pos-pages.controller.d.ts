import { Repository, DataSource } from 'typeorm';
import { Order, OrderItem } from '../orders/entities/order.entity';
import { Coupon } from '../coupons/entities/coupon.entity';
import { Customer } from '../customers/entities/customer.entity';
import { CustomersService } from '../customers/customers.service';
import { InventoryService } from '../inventory/inventory.service';
import { StockLevel } from '../inventory/entities/inventory.entity';
import { ProductVariant } from '../products/entities/product.entity';
export declare class PosPagesController {
    private readonly orderRepo;
    private readonly orderItemRepo;
    private readonly couponRepo;
    private readonly stockLevelRepo;
    private readonly variantRepo;
    private readonly customersService;
    private readonly inventoryService;
    private readonly dataSource;
    constructor(orderRepo: Repository<Order>, orderItemRepo: Repository<OrderItem>, couponRepo: Repository<Coupon>, stockLevelRepo: Repository<StockLevel>, variantRepo: Repository<ProductVariant>, customersService: CustomersService, inventoryService: InventoryService, dataSource: DataSource);
    getAnalyticsSummary(startDate?: string, endDate?: string, channel?: string): Promise<{
        data: {
            orderCount: number;
            totalRevenue: number;
            totalDiscount: number;
            avgOrderValue: number;
            paymentBreakdown: {
                method: any;
                count: number;
                total: number;
            }[];
            topProducts: {
                productName: any;
                sku: any;
                totalQty: number;
                totalRevenue: number;
            }[];
            dailyRevenue: {
                date: any;
                orders: number;
                revenue: number;
            }[];
        };
    }>;
    getCoupons(page?: number, limit?: number, status?: string): Promise<{
        data: {
            items: Coupon[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    getCustomers(page?: number, limit?: number, search?: string): Promise<{
        data: {
            items: Customer[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    getCustomer(id: string): Promise<{
        data: {
            recentOrders: Order[];
            userId: string;
            user: import("../users/entities/user.entity").User;
            totalOrders: number;
            totalSpentNgn: number;
            totalSpentUsd: number;
            lastOrderAt?: Date;
            avgOrderValueNgn: number;
            tags: string[];
            notes?: string;
            marketingOptIn: boolean;
            marketingOptInAt?: Date;
            addresses: import("../customers/entities/customer.entity").CustomerAddress[];
            id: string;
            createdAt: Date;
            updatedAt: Date;
            deletedAt?: Date | null;
        };
    }>;
    getInventory(page?: number, limit?: number, search?: string, lowStockOnly?: string): Promise<{
        data: {
            items: {
                variantId: any;
                warehouseCode: any;
                onHand: number;
                reserved: number;
                available: number;
                lastMovementAt: any;
                sku: any;
                variantName: any;
                barcode: any;
                productName: any;
                productId: any;
            }[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    getMovements(variantId: string, page?: number, limit?: number): Promise<{
        data: {
            items: import("../inventory/entities/inventory.entity").StockMovement[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
}
