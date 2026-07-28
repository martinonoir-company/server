import { BaseEntity } from '../../../shared/entities/base.entity';
import { Order } from '../../orders/entities/order.entity';
import { Payment, PaymentChannel } from '../../payments/entities/payment.entity';
export declare enum RefundStatus {
    PENDING = "PENDING",
    APPROVED = "APPROVED",
    PROCESSING = "PROCESSING",
    SUCCEEDED = "SUCCEEDED",
    FAILED = "FAILED",
    REJECTED = "REJECTED",
    COMPLETED_BY_STAFF = "COMPLETED_BY_STAFF"
}
export declare enum RefundMethod {
    PAYSTACK_REFUND = "PAYSTACK_REFUND",
    PAYSTACK_TRANSFER = "PAYSTACK_TRANSFER",
    CASH = "CASH"
}
export declare class RefundRequest extends BaseEntity {
    orderId: string;
    order: Order;
    originalPaymentId?: string | null;
    originalPayment?: Payment | null;
    channel: PaymentChannel;
    amount: number;
    currency: string;
    itemsCount: number;
    status: RefundStatus;
    method: RefundMethod;
    reason?: string;
    requestedBy?: string;
    decidedBy?: string | null;
    decidedAt?: Date | null;
    decisionReason?: string | null;
    bankCode?: string | null;
    bankAccountNumber?: string | null;
    bankAccountName?: string | null;
    providerReference?: string | null;
    transferRecipientCode?: string | null;
    failureReason?: string | null;
    refundedAt?: Date | null;
    rawProviderData?: Record<string, unknown> | null;
    items?: RefundRequestItem[];
}
export declare class RefundRequestItem extends BaseEntity {
    refundRequestId: string;
    refundRequest: RefundRequest;
    orderItemId?: string | null;
    variantId: string;
    productName: string;
    variantName?: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    reasonCode?: string;
    reasonNote?: string;
    stockMovementId?: string | null;
}
