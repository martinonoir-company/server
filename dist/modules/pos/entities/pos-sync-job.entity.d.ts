import { BaseEntity } from '../../../shared/entities/base.entity';
export declare enum SyncJobStatus {
    PENDING = "PENDING",
    PROCESSING = "PROCESSING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
    DEAD_LETTER = "DEAD_LETTER"
}
export declare class PosSyncJob extends BaseEntity {
    transactionId: string;
    terminalId: string;
    transactionPayload: Record<string, any>;
    status: SyncJobStatus;
    retryCount: number;
    errorMessage?: string;
    orderId?: string;
}
