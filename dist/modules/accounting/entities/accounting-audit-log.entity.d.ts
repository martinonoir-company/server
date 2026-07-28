import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';
export declare enum AccountingAuditAction {
    EXPENSE_CREATED = "EXPENSE_CREATED",
    EXPENSE_UPDATED = "EXPENSE_UPDATED",
    EXPENSE_DELETED = "EXPENSE_DELETED",
    EXPENSE_RESTORED = "EXPENSE_RESTORED",
    REPORT_EXPORTED = "REPORT_EXPORTED"
}
export declare class AccountingAuditLog extends BaseEntity {
    action: AccountingAuditAction;
    entityType: string;
    entityId?: string | null;
    actorId: string;
    actor?: User | null;
    actorLabel: string;
    payload?: Record<string, unknown> | null;
}
