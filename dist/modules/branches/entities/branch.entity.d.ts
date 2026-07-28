import { BaseEntity } from '../../../shared/entities/base.entity';
import { Terminal } from './terminal.entity';
import { UserBranch } from './user-branch.entity';
export declare class Branch extends BaseEntity {
    code: string;
    name: string;
    warehouseCode: string;
    address?: {
        line1?: string;
        line2?: string;
        city?: string;
        state?: string;
        countryCode?: string;
        postalCode?: string;
    } | null;
    phone?: string | null;
    isActive: boolean;
    terminals?: Terminal[];
    assignments?: UserBranch[];
}
