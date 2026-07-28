import { IPaymentProvider, PaymentProviderName, PaymentIntent, CreatePaymentInput, VerifyPaymentInput, RefundInput, RefundResult, WebhookPayload } from '../interfaces/payment-provider.interface';
export declare class StripeProvider implements IPaymentProvider {
    readonly name = PaymentProviderName.STRIPE;
    private readonly logger;
    private readonly secretKey;
    private readonly webhookSecret;
    private readonly isLive;
    constructor();
    createPayment(input: CreatePaymentInput): Promise<PaymentIntent>;
    verifyPayment(input: VerifyPaymentInput): Promise<PaymentIntent>;
    refund(input: RefundInput): Promise<RefundResult>;
    verifyWebhookSignature(payload: WebhookPayload): boolean;
}
