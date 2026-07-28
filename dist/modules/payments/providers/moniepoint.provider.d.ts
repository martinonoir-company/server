import { IPaymentProvider, PaymentProviderName, PaymentIntent, PaymentIntentStatus, CreatePaymentInput, VerifyPaymentInput, RefundInput, RefundResult, WebhookPayload } from '../interfaces/payment-provider.interface';
export interface TerminalPushResult {
    merchantReference: string;
    transactionReference?: string;
    status: PaymentIntentStatus;
    message?: string;
    raw?: Record<string, unknown>;
}
export interface TerminalStatusResult {
    merchantReference: string;
    transactionReference?: string;
    status: PaymentIntentStatus;
    actualAmount?: number;
    responseCode?: string;
    responseMessage?: string;
    raw?: Record<string, unknown>;
}
export declare class MoniepointProvider implements IPaymentProvider {
    readonly name = PaymentProviderName.MONIEPOINT;
    private readonly logger;
    private readonly apiKey;
    private readonly baseUrl;
    private readonly isLive;
    constructor();
    private authedFetch;
    introspect(): Promise<{
        ok: boolean;
        status: number;
        body: Record<string, unknown>;
    }>;
    pushToTerminal(input: {
        terminalSerial: string;
        amount: number;
        merchantReference: string;
    }): Promise<TerminalPushResult>;
    lookupTerminalTransaction(merchantReference: string): Promise<TerminalStatusResult>;
    createPayment(input: CreatePaymentInput): Promise<PaymentIntent>;
    verifyPayment(input: VerifyPaymentInput): Promise<PaymentIntent>;
    refund(input: RefundInput): Promise<RefundResult>;
    verifyWebhookSignature(_payload: WebhookPayload): boolean;
}
