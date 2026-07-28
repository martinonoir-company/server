export declare class PosTransactionItemDto {
    variantId: string;
    quantity: number;
    unitPrice: number;
    priceMode?: 'RETAIL' | 'WHOLESALE';
}
export declare class PosPaymentDto {
    method: 'CASH' | 'POS_TERMINAL' | 'BANK_TRANSFER';
    amount: number;
}
export declare class PosTransactionDto {
    transactionId: string;
    terminalId: string;
    staffId?: string;
    items: PosTransactionItemDto[];
    payments: PosPaymentDto[];
    currency?: string;
    timestamp: string;
    couponCode?: string;
    discountAmount?: number;
    discountType?: string;
    staffName?: string;
    discountAppliedAt?: string;
    customerName?: string;
    customerPhone?: string;
    agentCode?: string;
}
export declare class PosSyncBatchDto {
    terminalId: string;
    transactions: PosTransactionDto[];
}
export interface PosTransactionResult {
    transactionId: string;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    orderId?: string;
    orderNumber?: string;
    reason?: string;
}
export interface PosSyncBatchResult {
    terminalId: string;
    processedAt: string;
    successful: {
        transactionId: string;
        orderId: string;
        orderNumber: string;
    }[];
    failed: {
        transactionId: string;
        reason: string;
    }[];
    skipped: {
        transactionId: string;
        reason: string;
    }[];
    summary: {
        total: number;
        successCount: number;
        failedCount: number;
        skippedCount: number;
    };
}
