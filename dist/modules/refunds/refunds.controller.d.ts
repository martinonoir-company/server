import { User } from '../users/entities/user.entity';
import { RefundsService } from './refunds.service';
import { PaystackProvider } from '../payments/providers/paystack.provider';
declare class RefundLineDto {
    clientLineId: string;
    variantId: string;
    quantity: number;
    orderItemId?: string;
    reasonCode?: string;
    reasonNote?: string;
}
declare class CreateRefundFromReturnDto {
    orderId: string;
    lines: RefundLineDto[];
    warehouseCode?: string;
    reason?: string;
    posCashRefund?: boolean;
    bankDetails?: {
        bankCode: string;
        accountNumber: string;
        accountName: string;
    };
    customAmount?: number;
}
declare class ApproveRefundDto {
    amount?: number;
}
declare class VerifyBankAccountDto {
    accountNumber: string;
    bankCode: string;
}
declare class RejectRefundDto {
    decisionReason?: string;
}
export declare class RefundsController {
    private readonly refundsService;
    private readonly paystack;
    private readonly logger;
    constructor(refundsService: RefundsService, paystack: PaystackProvider);
    lookupOrder(orderNumber: string): Promise<{
        data: {
            id: string;
            orderNumber: string;
            channel: import("../orders/entities/order.entity").OrderChannel;
            status: import("../orders/entities/order.entity").OrderStatus;
            grandTotal: number;
            currency: string;
            customerName?: string | null;
            customerPhone?: string | null;
            paidAt?: Date | null;
            items: Array<{
                id: string;
                variantId: string;
                productName: string;
                variantName?: string;
                sku: string;
                quantity: number;
                unitPrice: number;
            }>;
        };
    }>;
    create(dto: CreateRefundFromReturnDto, user: User): Promise<{
        data: import("./entities/refund-request.entity").RefundRequest;
    }>;
    verifyBankAccount(dto: VerifyBankAccountDto): Promise<{
        data: {
            ok: boolean;
            error: string;
            accountName?: undefined;
        };
    } | {
        data: {
            ok: boolean;
            accountName: string;
            error?: undefined;
        };
    }>;
    listBanks(): Promise<{
        data: {
            name: string;
            code: string;
        }[];
    }>;
    list(page?: string, limit?: string, status?: string, channel?: string, search?: string): Promise<{
        data: {
            items: import("./entities/refund-request.entity").RefundRequest[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    findOne(id: string): Promise<{
        data: import("./entities/refund-request.entity").RefundRequest;
    }>;
    approve(id: string, dto: ApproveRefundDto, user: User): Promise<{
        data: import("./entities/refund-request.entity").RefundRequest;
    }>;
    reject(id: string, dto: RejectRefundDto, user: User): Promise<{
        data: import("./entities/refund-request.entity").RefundRequest;
    }>;
    retry(id: string): Promise<{
        data: import("./entities/refund-request.entity").RefundRequest;
    }>;
}
export {};
