import { DataSource, Repository } from 'typeorm';
import { PosSession } from './entities/pos-session.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Terminal } from '../branches/entities/terminal.entity';
import { UserBranch } from '../branches/entities/user-branch.entity';
import { ProductVariant, Product, ProductMedia } from '../products/entities/product.entity';
import { StockLevel } from '../inventory/entities/inventory.entity';
import { UserRole } from '../users/entities/user.entity';
import { PosSyncService } from '../pos/pos-sync.service';
import { PosGateway } from '../realtime/pos.gateway';
import { AddSessionItemDto, ConfirmSessionDto, PaymentIntentDto, UpdateSessionItemDto } from './dto/pos-session.dto';
export interface SessionActor {
    staffId: string;
    role: UserRole;
}
export declare class PosSessionsService {
    private readonly sessionRepo;
    private readonly terminalRepo;
    private readonly branchRepo;
    private readonly userBranchRepo;
    private readonly variantRepo;
    private readonly productRepo;
    private readonly mediaRepo;
    private readonly levelRepo;
    private readonly posSyncService;
    private readonly gateway;
    private readonly dataSource;
    private readonly logger;
    constructor(sessionRepo: Repository<PosSession>, terminalRepo: Repository<Terminal>, branchRepo: Repository<Branch>, userBranchRepo: Repository<UserBranch>, variantRepo: Repository<ProductVariant>, productRepo: Repository<Product>, mediaRepo: Repository<ProductMedia>, levelRepo: Repository<StockLevel>, posSyncService: PosSyncService, gateway: PosGateway, dataSource: DataSource);
    open(terminalCode: string, actor: SessionActor, currency?: 'NGN' | 'USD'): Promise<PosSession>;
    getCurrent(terminalCode: string, actor: SessionActor): Promise<PosSession>;
    addItem(terminalCode: string, actor: SessionActor, dto: AddSessionItemDto): Promise<PosSession>;
    updateItem(terminalCode: string, actor: SessionActor, lineId: string, dto: UpdateSessionItemDto): Promise<PosSession>;
    paymentIntent(terminalCode: string, actor: SessionActor, dto: PaymentIntentDto): Promise<PosSession>;
    confirm(terminalCode: string, actor: SessionActor, dto: ConfirmSessionDto): Promise<PosSession>;
    void(terminalCode: string, actor: SessionActor, version: number, reason?: string): Promise<PosSession>;
    private mutateActive;
    private lockOpenSession;
    private resolveTerminalAndBranch;
    private assertActorAssignedToBranch;
    private recomputeTotals;
}
