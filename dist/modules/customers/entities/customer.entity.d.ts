import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';
export declare class Customer extends BaseEntity {
    userId: string;
    user: User;
    totalOrders: number;
    totalSpentNgn: number;
    totalSpentUsd: number;
    lastOrderAt?: Date;
    avgOrderValueNgn: number;
    tags: string[];
    notes?: string;
    marketingOptIn: boolean;
    marketingOptInAt?: Date;
    addresses: CustomerAddress[];
}
export declare class CustomerAddress extends BaseEntity {
    customerId: string;
    customer: Customer;
    label: string;
    firstName: string;
    lastName: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode?: string;
    country: string;
    phone?: string;
    isDefault: boolean;
}
