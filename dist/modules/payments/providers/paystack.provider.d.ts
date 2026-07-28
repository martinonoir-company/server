import { IPaymentProvider, PaymentProviderName, PaymentIntent, CreatePaymentInput, VerifyPaymentInput, RefundInput, RefundResult, WebhookPayload } from '../interfaces/payment-provider.interface';
export declare class PaystackProvider implements IPaymentProvider {
    readonly name = PaymentProviderName.PAYSTACK;
    private readonly logger;
    private readonly secretKey;
    private readonly isLive;
    constructor();
    createPayment(input: CreatePaymentInput): Promise<PaymentIntent>;
    verifyPayment(input: VerifyPaymentInput): Promise<PaymentIntent>;
    refund(input: RefundInput): Promise<RefundResult>;
    resolveBankAccount(input: {
        accountNumber: string;
        bankCode: string;
    }): Promise<{
        accountName: string;
    } | {
        error: string;
    }>;
    listBanks(): Promise<Array<{
        name: string;
        code: string;
    }>>;
    createTransferRecipient(input: {
        accountNumber: string;
        bankCode: string;
        accountName: string;
    }): Promise<{
        recipientCode: string;
    } | {
        error: string;
    }>;
    initiateTransfer(input: {
        recipientCode: string;
        amount: number;
        reason: string;
        reference: string;
    }): Promise<{
        providerReference: string;
        status: 'PENDING' | 'SUCCEEDED';
    } | {
        error: string;
    }>;
    verifyWebhookSignature(payload: WebhookPayload): boolean;
}
