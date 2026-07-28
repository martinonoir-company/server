import { Repository, DataSource } from 'typeorm';
import { IPaymentProvider, PaymentProviderName, CreatePaymentInput, PaymentIntent, PaymentIntentStatus, VerifyPaymentInput, RefundInput, RefundResult } from './interfaces/payment-provider.interface';
import { MoniepointProvider } from './providers/moniepoint.provider';
import { PaystackProvider } from './providers/paystack.provider';
import { StripeProvider } from './providers/stripe.provider';
import { Payment, PaymentProvider, PaymentChannel, PaymentMethodType, PaymentStatus } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { AgentsService } from '../agents/agents.service';
import { ShippingDispatchService } from '../shipping/shipping-dispatch.service';
import { PosGateway } from '../realtime/pos.gateway';
export interface RecordPaymentInput {
    orderId: string;
    orderNumber: string;
    provider: PaymentProvider;
    channel: PaymentChannel;
    method: PaymentMethodType;
    amount: number;
    currency: string;
    merchantReference: string;
    providerReference?: string | null;
    terminalSerial?: string | null;
    checkoutUrl?: string | null;
    status?: PaymentStatus;
    createdBy?: string | null;
    paidAt?: Date | null;
}
export declare class PaymentsService {
    private readonly moniepoint;
    private readonly paystack;
    private readonly stripe;
    private readonly paymentRepo;
    private readonly orderRepo;
    private readonly dataSource;
    private readonly agentsService?;
    private readonly shippingDispatchService?;
    private readonly posGateway?;
    private readonly logger;
    private readonly providers;
    constructor(moniepoint: MoniepointProvider, paystack: PaystackProvider, stripe: StripeProvider, paymentRepo: Repository<Payment>, orderRepo: Repository<Order>, dataSource: DataSource, agentsService?: AgentsService | undefined, shippingDispatchService?: ShippingDispatchService | undefined, posGateway?: PosGateway | undefined);
    resolveProvider(currency: string, preferred?: PaymentProviderName): IPaymentProvider;
    createProviderPayment(input: CreatePaymentInput, preferred?: PaymentProviderName): Promise<PaymentIntent>;
    verifyProviderPayment(input: VerifyPaymentInput): Promise<PaymentIntent>;
    refundProviderPayment(providerName: PaymentProviderName, input: RefundInput): Promise<RefundResult>;
    record(input: RecordPaymentInput): Promise<Payment>;
    findById(id: string): Promise<Payment>;
    findByMerchantReference(ref: string): Promise<Payment | null>;
    findByOrder(orderId: string): Promise<Payment[]>;
    applyProviderState(paymentId: string, next: {
        status: PaymentStatus;
        providerReference?: string | null;
        gatewayResponse?: string | null;
        failureReason?: string | null;
        rawProviderData?: Record<string, unknown> | null;
    }): Promise<Payment>;
    attachWebhook(paymentId: string, body: Record<string, unknown>): Promise<void>;
    private recomputeOrderPaid;
    private fireOrderPaidHooks;
    list(opts?: {
        page?: number;
        limit?: number;
        status?: PaymentStatus;
        channel?: PaymentChannel;
        provider?: PaymentProvider;
        search?: string;
    }): Promise<{
        items: Payment[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    initiatePaystackPayment(input: {
        order: Order;
        channel: PaymentChannel;
        customerEmail: string;
        customerName: string;
        callbackUrl: string;
    }): Promise<Payment>;
    verifyAndReconcile(merchantReference: string): Promise<Payment>;
    recordCashPayment(input: {
        order: Order;
        amount: number;
        createdBy?: string | null;
    }): Promise<Payment>;
    pushTerminalPayment(input: {
        order: Order;
        amount: number;
        terminalSerial: string;
        createdBy?: string | null;
    }): Promise<Payment>;
    static mapIntentStatus(s: PaymentIntentStatus): PaymentStatus;
}
