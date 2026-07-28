import { InventoryService } from './inventory.service';
import { MovementKind } from './entities/inventory.entity';
export declare class RecordMovementDto {
    variantId: string;
    kind: MovementKind;
    quantity: number;
    warehouseCode?: string;
    referenceId?: string;
    referenceType?: string;
    reason?: string;
}
export declare class RecordMovementBatchLineDto {
    clientLineId: string;
    variantId: string;
    kind: MovementKind;
    quantity: number;
    warehouseCode?: string;
    referenceId?: string;
    referenceType?: string;
    reason?: string;
}
export declare class RecordMovementBatchDto {
    lines: RecordMovementBatchLineDto[];
}
export declare class StockLevelQueryDto {
    page?: number;
    limit?: number;
    warehouseCode?: string;
    lowStockOnly?: boolean;
    lowStockThreshold?: number;
}
export declare class InventoryController {
    private readonly inventoryService;
    constructor(inventoryService: InventoryService);
    recordMovement(dto: RecordMovementDto, req: any): Promise<{
        data: import("./entities/inventory.entity").StockMovement;
    }>;
    recordMovementsBatch(dto: RecordMovementBatchDto, req: any): Promise<{
        data: import("./inventory.service").RecordMovementBatchResult;
    }>;
    getAllStockLevels(query: StockLevelQueryDto): Promise<{
        data: {
            items: import("./entities/inventory.entity").StockLevel[];
            total: number;
            page: number;
            limit: number;
        };
    }>;
    getStockLevel(variantId: string, warehouse?: string): Promise<{
        data: import("./entities/inventory.entity").StockLevel | null;
    }>;
    getMovementHistory(variantId: string, limit?: number): Promise<{
        data: {
            items: import("./entities/inventory.entity").StockMovement[];
            total: number;
        };
    }>;
}
