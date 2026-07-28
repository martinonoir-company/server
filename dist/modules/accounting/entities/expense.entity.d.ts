import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';
export declare enum ExpenseCategory {
    OPERATIONS = "OPERATIONS",
    MARKETING = "MARKETING",
    LOGISTICS = "LOGISTICS",
    SALARIES = "SALARIES",
    RENT_AND_UTILITIES = "RENT_AND_UTILITIES",
    COGS_ADJUSTMENT = "COGS_ADJUSTMENT",
    TAXES = "TAXES",
    PROFESSIONAL_FEES = "PROFESSIONAL_FEES",
    TRAVEL = "TRAVEL",
    EQUIPMENT = "EQUIPMENT",
    OTHER = "OTHER"
}
export declare class Expense extends BaseEntity {
    title: string;
    category: ExpenseCategory;
    amountMinor: number;
    currency: string;
    incurredAt: Date;
    notes?: string | null;
    vendor?: string | null;
    referenceNumber?: string | null;
    createdBy: string;
    createdByUser?: User | null;
    updatedBy?: string | null;
}
