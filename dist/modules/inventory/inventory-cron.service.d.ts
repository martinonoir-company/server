import { Repository } from 'typeorm';
import { StockMovement, StockLevel } from './entities/inventory.entity';
import { ProductVariant } from '../products/entities/product.entity';
import { InventoryService } from './inventory.service';
import { EmailService } from '../notifications/email.service';
export declare class InventoryCronService {
    private readonly movementRepo;
    private readonly levelRepo;
    private readonly variantRepo;
    private readonly inventoryService;
    private readonly emailService;
    private readonly logger;
    private readonly RESERVATION_TTL_MINUTES;
    private readonly LOW_STOCK_THRESHOLD;
    private readonly ADMIN_ALERT_EMAIL;
    private readonly lastAlerted;
    private readonly ALERT_COOLDOWN_MS;
    constructor(movementRepo: Repository<StockMovement>, levelRepo: Repository<StockLevel>, variantRepo: Repository<ProductVariant>, inventoryService: InventoryService, emailService: EmailService);
    expireReservations(): Promise<void>;
    checkLowStock(): Promise<void>;
}
