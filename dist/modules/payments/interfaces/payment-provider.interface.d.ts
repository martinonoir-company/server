export interface PaymentIntent {
    providerReference: string;
    amount: number;
    currency: string;
    provider: PaymentProviderName;
    status: PaymentIntentStatus;
    checkoutUrl?: string;
    metadata?: Record<string, unknown>;
}
export declare enum PaymentProviderName {
    MONIEPOINT = "MONIEPOINT",
    PAYSTACK = "PAYSTACK",
    STRIPE = "STRIPE"
}
export declare enum PaymentIntentStatus {
    PENDING = "PENDING",
    REQUIRES_ACTION = "REQUIRES_ACTION",
    PROCESSING = "PROCESSING",
    SUCCEEDED = "SUCCEEDED",
    FAILED = "FAILED",
    CANCELLED = "CANCELLED"
}
export interface CreatePaymentInput {
    orderId: string;
    orderNumber: string;
    amount: number;
    currency: string;
    customerEmail: string;
    customerName: string;
    callbackUrl: string;
    metadata?: Record<string, string>;
}
export interface VerifyPaymentInput {
    providerReference: string;
    provider: PaymentProviderName;
}
export interface RefundInput {
    providerReference: string;
    amount: number;
    reason?: string;
}
export interface RefundResult {
    providerReference: string;
    refundReference: string;
    amount: number;
    status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
}
export interface WebhookPayload {
    provider: PaymentProviderName;
    rawBody: Buffer;
    signature: string;
    headers: Record<string, string>;
}
export interface IPaymentProvider {
    readonly name: PaymentProviderName;
    createPayment(input: CreatePaymentInput): Promise<PaymentIntent>;
    verifyPayment(input: VerifyPaymentInput): Promise<PaymentIntent>;
    refund(input: RefundInput): Promise<RefundResult>;
    verifyWebhookSignature(payload: WebhookPayload): boolean;
}
