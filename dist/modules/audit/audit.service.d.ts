import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
export interface AuditLogInput {
    actorId: string;
    actorEmail: string;
    actorRole: string;
    action: string;
    resourceType: string;
    resourceId: string;
    description?: string;
    previousState?: Record<string, unknown>;
    newState?: Record<string, unknown>;
    changes?: Record<string, {
        from: unknown;
        to: unknown;
    }>;
    ipAddress?: string;
    userAgent?: string;
    channel?: string;
}
export interface AuditLogQuery {
    actorId?: string;
    resourceType?: string;
    resourceId?: string;
    action?: string;
    channel?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
}
export declare class AuditService {
    private readonly auditRepo;
    constructor(auditRepo: Repository<AuditLog>);
    log(input: AuditLogInput): Promise<AuditLog>;
    static computeChanges(previous: Record<string, unknown>, current: Record<string, unknown>): Record<string, {
        from: unknown;
        to: unknown;
    }> | undefined;
    findAll(query: AuditLogQuery): Promise<{
        items: AuditLog[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    getResourceHistory(resourceType: string, resourceId: string): Promise<AuditLog[]>;
}
