import { Repository, DataSource, EntityManager } from 'typeorm';
import { StockMovement, StockLevel, MovementKind } from './entities/inventory.entity';
import { CacheService } from '../../shared/services/cache.service';
export interface RecordMovementInput {
    variantId: string;
    kind: MovementKind;
    quantity: number;
    warehouseCode?: string;
    referenceId?: string;
    referenceType?: string;
    reason?: string;
    createdBy?: string;
    clientLineId?: string;
}
export interface RecordMovementBatchLine {
    clientLineId: string;
    variantId: string;
    kind: MovementKind;
    quantity: number;
    warehouseCode?: string;
    referenceId?: string;
    referenceType?: string;
    reason?: string;
}
export interface RecordMovementBatchLineResult {
    clientLineId: string;
    status: 'ACCEPTED' | 'DEDUPLICATED';
    movementId: string;
}
export interface RecordMovementBatchResult {
    accepted: number;
    deduplicated: number;
    lines: RecordMovementBatchLineResult[];
}
export declare class InventoryService {
    private readonly movementRepo;
    private readonly levelRepo;
    private readonly dataSource;
    private readonly cacheService?;
    private readonly logger;
    constructor(movementRepo: Repository<StockMovement>, levelRepo: Repository<StockLevel>, dataSource: DataSource, cacheService?: CacheService | undefined);
    recordMovement(input: RecordMovementInput): Promise<StockMovement>;
    recordMovementOnManager(manager: EntityManager, input: RecordMovementInput): Promise<{
        movement: StockMovement;
        deduplicated: boolean;
    }>;
    recordMovementsBatch(lines: RecordMovementBatchLine[], createdBy: string | undefined): Promise<RecordMovementBatchResult>;
    getStockLevel(variantId: string, warehouseCode?: string): Promise<StockLevel | null>;
    getStockLevels(variantId: string): Promise<StockLevel[]>;
    getAllStockLevels(query?: {
        page?: number;
        limit?: number;
        warehouseCode?: string;
        lowStockOnly?: boolean;
        lowStockThreshold?: number;
    }): Promise<{
        items: StockLevel[];
        total: number;
        page: number;
        limit: number;
    }>;
    getMovementHistory(variantId: string, limit?: number, offset?: number): Promise<{
        items: StockMovement[];
        total: number;
    }>;
    checkAvailability(items: {
        variantId: string;
        quantity: number;
    }[]): Promise<{
        variantId: string;
        available: number;
        sufficient: boolean;
    }[]>;
}
