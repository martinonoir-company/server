export declare class OpenSessionDto {
    currency?: 'NGN' | 'USD';
}
export declare class AddSessionItemDto {
    clientLineId: string;
    variantId: string;
    quantity: number;
    version: number;
}
export declare class UpdateSessionItemDto {
    quantity: number;
    version: number;
}
export declare class PaymentIntentDto {
    version: number;
    couponCode?: string;
    discountAmount?: number;
    discountType?: 'COUPON' | 'MANUAL';
    discountAppliedByName?: string;
}
export declare class ConfirmPaymentDto {
    method: 'CASH' | 'POS_TERMINAL' | 'BANK_TRANSFER';
    amount: number;
}
export declare class ConfirmSessionDto {
    version: number;
    payments: ConfirmPaymentDto[];
    customerName?: string;
    customerPhone?: string;
    agentCode?: string;
}
export declare class VoidSessionDto {
    version: number;
    reason?: string;
}
