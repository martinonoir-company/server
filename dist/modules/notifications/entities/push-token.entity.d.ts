import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';
export declare class PushToken extends BaseEntity {
    userId: string;
    user?: User;
    expoPushToken: string;
    platform?: 'ios' | 'android';
    deviceLabel?: string;
    isActive: boolean;
    lastUsedAt?: Date;
}
