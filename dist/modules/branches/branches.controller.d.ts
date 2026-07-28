import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';
import { CreateTerminalDto, UpdateTerminalDto } from './dto/terminal.dto';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { User } from '../users/entities/user.entity';
export declare class BranchesController {
    private readonly branchesService;
    constructor(branchesService: BranchesService);
    list(user: User): Promise<{
        data: import("./entities/branch.entity").Branch[];
    }>;
    getOne(id: string, user: User): Promise<{
        data: import("./entities/branch.entity").Branch;
    }>;
    create(dto: CreateBranchDto): Promise<{
        data: import("./entities/branch.entity").Branch;
    }>;
    update(id: string, dto: UpdateBranchDto): Promise<{
        data: import("./entities/branch.entity").Branch;
    }>;
    remove(id: string): Promise<{
        data: {
            deletedAt: Date;
        };
    }>;
    listTerminals(id: string, user: User): Promise<{
        data: import("./entities/terminal.entity").Terminal[];
    }>;
    createTerminal(id: string, dto: CreateTerminalDto): Promise<{
        data: import("./entities/terminal.entity").Terminal;
    }>;
    updateTerminal(id: string, terminalId: string, dto: UpdateTerminalDto): Promise<{
        data: import("./entities/terminal.entity").Terminal;
    }>;
    removeTerminal(id: string, terminalId: string): Promise<{
        data: {
            deletedAt: Date;
        };
    }>;
    listStaff(id: string): Promise<{
        data: {
            assignmentId: string;
            userId: string;
            firstName: string;
            lastName: string;
            email: string;
            role: import("../users/entities/user.entity").UserRole;
            assignedAt: Date;
        }[];
    }>;
    assignStaff(id: string, dto: AssignStaffDto): Promise<{
        data: import("./entities/user-branch.entity").UserBranch;
    }>;
    unassignStaff(id: string, userId: string): Promise<{
        data: {
            deletedAt: Date;
        };
    }>;
}
