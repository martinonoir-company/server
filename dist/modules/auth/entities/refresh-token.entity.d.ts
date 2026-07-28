import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';
export declare class RefreshToken extends BaseEntity {
    userId: string;
    user: User;
    tokenHash: string;
    family: string;
    expiresAt: Date;
    revoked: boolean;
    ipAddress?: string;
    userAgent?: string;
    get isExpired(): boolean;
}
