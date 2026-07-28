import { Repository, DataSource } from 'typeorm';
import { InventoryService } from '../inventory/inventory.service';
import { Order } from '../orders/entities/order.entity';
import { ProductVariant, Product } from '../products/entities/product.entity';
import { PosTransactionDto, PosSyncBatchDto, PosSyncBatchResult } from './dto/pos-sync.dto';
import { PosSyncJob } from './entities/pos-sync-job.entity';
import { PaymentsService } from '../payments/payments.service';
import { CouponsService } from '../coupons/coupons.service';
export declare class PosSyncService {
    private readonly inventoryService;
    private readonly dataSource;
    private readonly orderRepo;
    private readonly variantRepo;
    private readonly productRepo;
    private readonly syncJobRepo;
    private readonly paymentsService;
    private readonly couponsService;
    private readonly logger;
    constructor(inventoryService: InventoryService, dataSource: DataSource, orderRepo: Repository<Order>, variantRepo: Repository<ProductVariant>, productRepo: Repository<Product>, syncJobRepo: Repository<PosSyncJob>, paymentsService: PaymentsService, couponsService: CouponsService);
    processBatch(batch: PosSyncBatchDto): Promise<PosSyncBatchResult>;
    processTransaction(tx: PosTransactionDto): Promise<{
        status: 'SUCCESS' | 'SKIPPED';
        orderId?: string;
        orderNumber?: string;
        reason?: string;
    }>;
    private persistFailedJob;
    getRetryableJobs(maxRetries?: number): Promise<PosSyncJob[]>;
    completeJob(jobId: string, orderId: string): Promise<void>;
}
