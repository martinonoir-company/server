export declare class AuditLog {
    id: string;
    generateId(): void;
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
    channel: string;
    createdAt: Date;
}
