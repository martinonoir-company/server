import { PosSyncService } from './pos-sync.service';
import { InventoryService } from '../inventory/inventory.service';
import { PosSyncBatchDto } from './dto/pos-sync.dto';
export declare class PosSyncController {
    private readonly posSyncService;
    private readonly inventoryService;
    constructor(posSyncService: PosSyncService, inventoryService: InventoryService);
    syncBatch(dto: PosSyncBatchDto): Promise<{
        data: import("./dto/pos-sync.dto").PosSyncBatchResult;
    }>;
    getAllStockLevels(page?: number, limit?: number): Promise<{
        data: {
            items: import("../inventory/entities/inventory.entity").StockLevel[];
            total: number;
            page: number;
            limit: number;
        };
    }>;
    getStockLevel(variantId: string): Promise<{
        data: import("../inventory/entities/inventory.entity").StockLevel | null;
    }>;
}
