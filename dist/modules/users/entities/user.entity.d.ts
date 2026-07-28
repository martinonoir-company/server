import { BaseEntity } from '../../../shared/entities/base.entity';
export declare enum UserRole {
    SUPER_ADMIN = "SUPER_ADMIN",
    COMPANY_SUPER_ADMIN = "COMPANY_SUPER_ADMIN",
    COMPANY_STAFF = "COMPANY_STAFF",
    CUSTOMER = "CUSTOMER",
    MARKETING_AGENT = "MARKETING_AGENT"
}
export declare class User extends BaseEntity {
    firstName: string;
    lastName: string;
    email: string;
    passwordHash: string;
    phone?: string;
    role: UserRole;
    countryCode: string;
    preferredCurrency: 'NGN' | 'USD';
    emailVerified: boolean;
    totpSecret?: string;
    twoFactorEnabled: boolean;
    backupCodes?: string[];
    failedLoginAttempts: number;
    lockedUntil?: Date;
    lastLoginAt?: Date;
    avatarUrl?: string;
    permissions?: string[];
    get fullName(): string;
}
