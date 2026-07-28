import { BaseEntity } from '../../../shared/entities/base.entity';
import { Order } from '../../orders/entities/order.entity';
export declare enum PaymentProvider {
    PAYSTACK = "PAYSTACK",
    MONIEPOINT = "MONIEPOINT",
    CASH = "CASH"
}
export declare enum PaymentChannel {
    STOREFRONT = "STOREFRONT",
    MOBILE = "MOBILE",
    POS = "POS"
}
export declare enum PaymentMethodType {
    CARD = "CARD",
    CASH = "CASH",
    POS_TRANSFER = "POS_TRANSFER",
    BANK_TRANSFER = "BANK_TRANSFER"
}
export declare enum PaymentStatus {
    PENDING = "PENDING",
    PROCESSING = "PROCESSING",
    SUCCEEDED = "SUCCEEDED",
    FAILED = "FAILED",
    CANCELLED = "CANCELLED",
    REFUNDED = "REFUNDED"
}
export declare class Payment extends BaseEntity {
    orderId: string;
    order?: Order;
    orderNumber: string;
    provider: PaymentProvider;
    channel: PaymentChannel;
    method: PaymentMethodType;
    status: PaymentStatus;
    amount: number;
    currency: string;
    merchantReference: string;
    providerReference?: string | null;
    terminalSerial?: string | null;
    checkoutUrl?: string | null;
    gatewayResponse?: string | null;
    failureReason?: string | null;
    paidAt?: Date | null;
    rawProviderData?: Record<string, unknown> | null;
    rawWebhook?: Record<string, unknown> | null;
    createdBy?: string | null;
}
