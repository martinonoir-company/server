import { BaseEntity } from '../../../shared/entities/base.entity';
import { Branch } from './branch.entity';
export declare class Terminal extends BaseEntity {
    code: string;
    name: string;
    branchId: string;
    branch?: Branch;
    isActive: boolean;
    moniepointTerminalSerial?: string | null;
}
