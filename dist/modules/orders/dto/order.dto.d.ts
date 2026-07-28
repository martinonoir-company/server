import { OrderStatus, PaymentMethod, OrderChannel } from '../entities/order.entity';
export declare class CheckoutItemDto {
    variantId: string;
    quantity: number;
    wholesale?: boolean;
}
export declare class ShippingAddressDto {
    firstName: string;
    lastName: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode?: string;
    country: string;
    phone?: string;
}
export declare class CreateOrderDto {
    items: CheckoutItemDto[];
    shippingAddress: ShippingAddressDto;
    currency?: string;
    channel?: OrderChannel;
    paymentMethod?: PaymentMethod;
    couponCode?: string;
    customerNote?: string;
    guestEmail?: string;
    idempotencyKey?: string;
    agentCode?: string;
    shippingOptOut?: boolean;
    shippingStateCode?: string;
}
export declare class UpdateOrderStatusDto {
    status: OrderStatus;
    reason?: string;
}
export declare class DispatchOrderItemDto {
    orderItemId: string;
    scannedQty: number;
}
export declare class DispatchOrderDto {
    trackingNumber: string;
    carrier: string;
    items: DispatchOrderItemDto[];
    note?: string;
}
export declare class MarkDeliveredDto {
    note?: string;
}
export declare class OrderQueryDto {
    status?: OrderStatus;
    userId?: string;
    channel?: OrderChannel;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
    startDate?: string;
    endDate?: string;
    search?: string;
    wholesale?: string;
    dispatchStatus?: string;
    requiresDispatch?: string;
}
export declare class DispatchScanDto {
    note?: string;
}
