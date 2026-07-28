import { BaseEntity } from '../../../shared/entities/base.entity';
import { Branch } from './branch.entity';
import { User } from '../../users/entities/user.entity';
export declare class UserBranch extends BaseEntity {
    userId: string;
    user?: User;
    branchId: string;
    branch?: Branch;
}
