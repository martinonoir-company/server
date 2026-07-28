import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';
export declare class EmailVerificationToken extends BaseEntity {
    userId: string;
    user: User;
    tokenHash: string;
    expiresAt: Date;
    used: boolean;
    get isExpired(): boolean;
}
