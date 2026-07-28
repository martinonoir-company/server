import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { PaymentsService } from './payments.service';
import { PaymentStatus, PaymentChannel } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { Terminal } from '../branches/entities/terminal.entity';
import { RefundsService } from '../refunds/refunds.service';
import { AgentsService } from '../agents/agents.service';
import { MoniepointProvider } from './providers/moniepoint.provider';
import { User } from '../users/entities/user.entity';
export declare class InitiatePaymentDto {
    orderId: string;
    channel: PaymentChannel;
    customerEmail?: string;
    customerName?: string;
    callbackUrl?: string;
}
export declare class PosCashPaymentDto {
    orderId: string;
    amount: number;
}
export declare class PosTerminalPaymentDto {
    orderId: string;
    amount: number;
    terminalCode: string;
}
export declare class PaymentsController {
    private readonly paymentsService;
    private readonly orderRepo;
    private readonly terminalRepo;
    private readonly refundsService?;
    private readonly agentsService?;
    private readonly moniepoint?;
    private readonly logger;
    constructor(paymentsService: PaymentsService, orderRepo: Repository<Order>, terminalRepo: Repository<Terminal>, refundsService?: RefundsService | undefined, agentsService?: AgentsService | undefined, moniepoint?: MoniepointProvider | undefined);
    list(page?: string, limit?: string, status?: string, channel?: string, provider?: string, search?: string): Promise<{
        data: {
            items: import("./entities/payment.entity").Payment[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    byOrder(orderId: string): Promise<{
        data: import("./entities/payment.entity").Payment[];
    }>;
    findOne(id: string): Promise<{
        data: import("./entities/payment.entity").Payment;
    }>;
    initiatePayment(dto: InitiatePaymentDto, user?: User): Promise<{
        data: {
            paymentId: string;
            merchantReference: string;
            checkoutUrl: string | null | undefined;
            status: PaymentStatus;
            amount: number;
            currency: string;
        };
    }>;
    reconcile(merchantReference: string): Promise<{
        data: {
            paymentId: string;
            merchantReference: string;
            status: PaymentStatus;
            amount: number;
            currency: string;
            failureReason: string | null | undefined;
        };
    }>;
    posCash(dto: PosCashPaymentDto, user: User): Promise<{
        data: {
            paymentId: string;
            merchantReference: string;
            status: PaymentStatus;
            amount: number;
        };
    }>;
    posTerminal(dto: PosTerminalPaymentDto, user: User): Promise<{
        data: {
            paymentId: string;
            merchantReference: string;
            status: PaymentStatus;
            amount: number;
        };
    }>;
    paystackWebhook(req: RawBodyRequest<Request>, signature: string): Promise<{
        received: boolean;
    }>;
    moniepointWebhook(req: RawBodyRequest<Request>): Promise<{
        received: boolean;
    }>;
    stripeWebhook(req: RawBodyRequest<Request>, signature: string): Promise<{
        received: boolean;
    }>;
    moniepointIntrospect(): Promise<{
        data: {
            ok: boolean;
            error: string;
        };
    } | {
        data: {
            ok: boolean;
            status: number;
            body: Record<string, unknown>;
        };
    }>;
}
