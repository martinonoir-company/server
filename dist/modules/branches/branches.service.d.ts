import { DataSource, Repository } from 'typeorm';
import { Branch } from './entities/branch.entity';
import { Terminal } from './entities/terminal.entity';
import { UserBranch } from './entities/user-branch.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';
import { CreateTerminalDto, UpdateTerminalDto } from './dto/terminal.dto';
export declare class BranchesService {
    private readonly branchRepo;
    private readonly terminalRepo;
    private readonly userBranchRepo;
    private readonly userRepo;
    private readonly dataSource;
    constructor(branchRepo: Repository<Branch>, terminalRepo: Repository<Terminal>, userBranchRepo: Repository<UserBranch>, userRepo: Repository<User>, dataSource: DataSource);
    listForUser(user: {
        id: string;
        role: UserRole;
    }): Promise<Branch[]>;
    getByIdForUser(id: string, user: {
        id: string;
        role: UserRole;
    }): Promise<Branch>;
    create(dto: CreateBranchDto): Promise<Branch>;
    update(id: string, dto: UpdateBranchDto): Promise<Branch>;
    softDelete(id: string): Promise<{
        deletedAt: Date;
    }>;
    listTerminals(branchId: string, user: {
        id: string;
        role: UserRole;
    }): Promise<Terminal[]>;
    createTerminal(branchId: string, dto: CreateTerminalDto): Promise<Terminal>;
    updateTerminal(branchId: string, terminalId: string, dto: UpdateTerminalDto): Promise<Terminal>;
    softDeleteTerminal(branchId: string, terminalId: string): Promise<{
        deletedAt: Date;
    }>;
    listStaff(branchId: string): Promise<Array<{
        assignmentId: string;
        userId: string;
        firstName: string;
        lastName: string;
        email: string;
        role: UserRole;
        assignedAt: Date;
    }>>;
    assignStaff(branchId: string, userId: string): Promise<UserBranch>;
    unassignStaff(branchId: string, userId: string): Promise<{
        deletedAt: Date;
    }>;
    private assertCodeAvailable;
    private assertWarehouseCodeAvailable;
    private assertTerminalCodeAvailable;
    private assertNotLastActive;
    private assertNoBlockingDependencies;
    private assertNoActiveSessionForTerminal;
    private tableExists;
    private columnExists;
}
