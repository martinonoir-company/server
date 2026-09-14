import { DataSource, Repository } from 'typeorm';
import { RefundRequest, RefundRequestItem, RefundStatus } from './entities/refund-request.entity';
import { Order, OrderItem, OrderChannel, OrderStatus } from '../orders/entities/order.entity';
import { Payment, PaymentChannel } from '../payments/entities/payment.entity';
import { InventoryService } from '../inventory/inventory.service';
import { StockMovement } from '../inventory/entities/inventory.entity';
import { PaystackProvider } from '../payments/providers/paystack.provider';
import { AgentsService } from '../agents/agents.service';
interface RefundLineInput {
    orderItemId?: string;
    variantId: string;
    quantity: number;
    reasonCode?: string;
    reasonNote?: string;
    clientLineId: string;
}
export declare class RefundsService {
    private readonly refundRepo;
    private readonly itemRepo;
    private readonly orderRepo;
    private readonly orderItemRepo;
    private readonly paymentRepo;
    private readonly movementRepo;
    private readonly inventoryService;
    private readonly paystack;
    private readonly dataSource;
    private readonly agentsService?;
    private readonly logger;
    constructor(refundRepo: Repository<RefundRequest>, itemRepo: Repository<RefundRequestItem>, orderRepo: Repository<Order>, orderItemRepo: Repository<OrderItem>, paymentRepo: Repository<Payment>, movementRepo: Repository<StockMovement>, inventoryService: InventoryService, paystack: PaystackProvider, dataSource: DataSource, agentsService?: AgentsService | undefined);
    lookupOrderForReturn(orderNumber: string): Promise<{
        id: string;
        orderNumber: string;
        channel: OrderChannel;
        status: OrderStatus;
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
    }>;
    createFromReturn(input: {
        orderId: string;
        lines: RefundLineInput[];
        warehouseCode?: string;
        reason?: string;
        posCashRefund?: boolean;
        bankDetails?: {
            bankCode: string;
            accountNumber: string;
            accountName: string;
        };
        customAmount?: number;
        createdBy: string;
    }): Promise<RefundRequest>;
    list(opts: {
        page?: number;
        limit?: number;
        status?: RefundStatus;
        channel?: PaymentChannel;
        search?: string;
    }): Promise<{
        items: RefundRequest[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    findById(id: string): Promise<RefundRequest>;
    approve(id: string, decidedBy: string, amountOverride?: number): Promise<RefundRequest>;
    reject(id: string, decidedBy: string, decisionReason?: string): Promise<RefundRequest>;
    execute(id: string): Promise<RefundRequest>;
    settleByProviderReference(providerReference: string, outcome: 'SUCCEEDED' | 'FAILED', raw: Record<string, unknown>, failureReason?: string): Promise<RefundRequest | null>;
    totalsRefunded(from: Date, to: Date): Promise<{
        amountNgn: number;
        itemsCount: number;
        requestsCount: number;
    }>;
    private markOrderRefunded;
    private markOrderRefundedIfFull;
    private isOrderFullyRefunded;
}
export {};
