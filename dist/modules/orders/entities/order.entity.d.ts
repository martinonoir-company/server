import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';
export declare enum OrderStatus {
    DRAFT = "DRAFT",
    PENDING_PAYMENT = "PENDING_PAYMENT",
    PAID = "PAID",
    PROCESSING = "PROCESSING",
    SHIPPED = "SHIPPED",
    DELIVERED = "DELIVERED",
    CANCELLED = "CANCELLED",
    RETURN_REQUESTED = "RETURN_REQUESTED",
    RETURN_APPROVED = "RETURN_APPROVED",
    RETURNED = "RETURNED",
    REFUNDED = "REFUNDED"
}
export declare const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]>;
export declare enum PaymentMethod {
    MONIEPOINT = "MONIEPOINT",
    PAYSTACK = "PAYSTACK",
    STRIPE = "STRIPE",
    CASH = "CASH",
    BANK_TRANSFER = "BANK_TRANSFER",
    POS_TERMINAL = "POS_TERMINAL"
}
export declare enum OrderChannel {
    STOREFRONT = "STOREFRONT",
    ADMIN = "ADMIN",
    POS = "POS"
}
export declare class Order extends BaseEntity {
    orderNumber: string;
    userId?: string;
    user?: User;
    guestEmail?: string;
    status: OrderStatus;
    channel: OrderChannel;
    branchId?: string | null;
    currency: string;
    subtotal: number;
    discountTotal: number;
    shippingTotal: number;
    taxTotal: number;
    grandTotal: number;
    agentCode?: string | null;
    paymentMethod?: PaymentMethod;
    paymentReference?: string;
    paidAt?: Date;
    shippingAddress?: {
        firstName: string;
        lastName: string;
        line1: string;
        line2?: string;
        city: string;
        state: string;
        postalCode?: string;
        country: string;
        phone?: string;
    };
    couponCode?: string;
    discountType?: string;
    discountAppliedBy?: string;
    discountAppliedByName?: string;
    discountAppliedAt?: Date;
    idempotencyKey?: string;
    trackingNumber?: string;
    carrier?: string;
    shippedAt?: Date;
    deliveredAt?: Date;
    shippingOptOut: boolean;
    shippingQuoteId?: string;
    shippingQuoteExpiresAt?: Date;
    shippingBookingId?: string;
    shippingTrackingId?: string;
    shippingLabelUrl?: string;
    shippingStatus?: number;
    shippingEvents?: Array<{
        dateTime: string;
        status: number;
        scanType: string;
        description: string;
        location: string;
    }>;
    shippingLastTrackedAt?: Date;
    shippingRetryCount: number;
    shippingLastError?: string;
    isWholesale: boolean;
    dispatchStatus?: 'PENDING' | 'DISPATCHED' | null;
    dispatchedAt?: Date | null;
    dispatchedBy?: string | null;
    customerNote?: string;
    staffNote?: string;
    items: OrderItem[];
    statusHistory: OrderStatusHistory[];
}
export declare class OrderItem extends BaseEntity {
    orderId: string;
    order: Order;
    variantId: string;
    productName: string;
    variantName?: string;
    sku: string;
    quantity: number;
    refundedQuantity: number;
    unitPrice: number;
    lineTotal: number;
    discountAmount: number;
    imageUrl?: string;
    options?: Record<string, string>;
    isWholesale: boolean;
}
export declare class OrderStatusHistory extends BaseEntity {
    orderId: string;
    order: Order;
    fromStatus: OrderStatus;
    toStatus: OrderStatus;
    changedBy?: string;
    reason?: string;
}
