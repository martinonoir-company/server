import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderStatusDto, OrderQueryDto, DispatchOrderDto, DispatchScanDto, MarkDeliveredDto } from './dto/order.dto';
import { PricingEngine } from './pricing.engine';
import { User } from '../users/entities/user.entity';
import { CouponChannel } from '../coupons/entities/coupon.entity';
import { ShippingDispatchService } from '../shipping/shipping-dispatch.service';
declare class QuoteContextDto {
    currency: string;
    country: string;
    state: string;
    userId?: string;
    couponCode?: string;
    shippingMethod?: string;
    channel?: CouponChannel;
}
declare class QuoteItemDto {
    variantId: string;
    sku: string;
    productName: string;
    variantName?: string;
    quantity: number;
    unitPrice: number;
    compareAtPrice?: number;
    weightKg?: number;
    options?: Record<string, string>;
}
declare class QuoteRequestDto {
    items: QuoteItemDto[];
    context: QuoteContextDto;
}
export declare class OrdersController {
    private readonly ordersService;
    private readonly pricingEngine;
    private readonly shippingDispatch;
    constructor(ordersService: OrdersService, pricingEngine: PricingEngine, shippingDispatch: ShippingDispatchService);
    quote(dto: QuoteRequestDto): Promise<{
        data: import("./pricing.engine").QuoteResult;
    }>;
    checkout(dto: CreateOrderDto, user?: User): Promise<{
        data: import("./entities/order.entity").Order;
    }>;
    findAll(query: OrderQueryDto): Promise<{
        data: {
            items: import("./entities/order.entity").Order[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    dispatchQueue(query: OrderQueryDto): Promise<{
        data: {
            items: import("./entities/order.entity").Order[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    myOrders(user: User, query: OrderQueryDto): Promise<{
        data: {
            items: import("./entities/order.entity").Order[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    findOne(id: string): Promise<{
        data: import("./entities/order.entity").Order;
    }>;
    findByNumber(orderNumber: string): Promise<{
        data: import("./entities/order.entity").Order;
    }>;
    shippingState(id: string): Promise<{
        data: {
            orderId: string;
            orderNumber: string;
            optedOut: boolean;
            bookingId: string | null;
            trackingId: string | null;
            labelUrl: string | null;
            status: number | null;
            progress: number;
            lastError: string | null;
            retryCount: number;
        };
    }>;
    tracking(id: string): Promise<{
        data: {
            trackingNumber: string | null;
            status: number | null;
            description: string;
            etaDays?: number;
            etaDate?: string;
            events: import("../shipping/aaj.provider").AajTrackingResult["events"];
            labelUrl?: string | null;
            optedOut: boolean;
            pending: boolean;
            lastError?: string | null;
        };
    }>;
    publicTracking(orderNumber: string, email?: string): Promise<{
        data: {
            orderNumber: string;
            status: number | null;
            description: string;
            etaDays: number | undefined;
            etaDate: string | undefined;
            events: import("../shipping/aaj.provider").AajTrackingEvent[];
            trackingNumber: string | null;
            optedOut: boolean;
            pending: boolean;
        };
    }>;
    updateStatus(id: string, dto: UpdateOrderStatusDto, user?: User): Promise<{
        data: import("./entities/order.entity").Order;
    }>;
    dispatch(id: string, dto: DispatchOrderDto, user?: User): Promise<{
        data: import("./entities/order.entity").Order;
    }>;
    dispatchScan(ref: string, dto: DispatchScanDto, user?: User): Promise<{
        data: import("./entities/order.entity").Order;
    }>;
    markDelivered(id: string, dto: MarkDeliveredDto, user?: User): Promise<{
        data: import("./entities/order.entity").Order;
    }>;
}
export {};
