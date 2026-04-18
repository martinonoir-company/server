import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, FindOptionsWhere } from 'typeorm';
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
  changes?: Record<string, { from: unknown; to: unknown }>;
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

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>,
  ) {}

  /**
   * Record an audit log entry. Fire-and-forget — failures are logged but don't block the caller.
   */
  async log(input: AuditLogInput): Promise<AuditLog> {
    const entry = this.auditRepo.create({
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      actorRole: input.actorRole,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      description: input.description,
      previousState: input.previousState,
      newState: input.newState,
      changes: input.changes,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      channel: input.channel ?? 'admin',
    });

    return this.auditRepo.save(entry);
  }

  /**
   * Compute field-level changes between two objects.
   */
  static computeChanges(
    previous: Record<string, unknown>,
    current: Record<string, unknown>,
  ): Record<string, { from: unknown; to: unknown }> | undefined {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const allKeys = new Set([...Object.keys(previous), ...Object.keys(current)]);

    for (const key of allKeys) {
      const from = previous[key];
      const to = current[key];
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        changes[key] = { from, to };
      }
    }

    return Object.keys(changes).length > 0 ? changes : undefined;
  }

  /**
   * Query audit logs with filtering and pagination.
   */
  async findAll(query: AuditLogQuery): Promise<{
    items: AuditLog[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<AuditLog> = {};

    if (query.actorId) where.actorId = query.actorId;
    if (query.resourceType) where.resourceType = query.resourceType;
    if (query.resourceId) where.resourceId = query.resourceId;
    if (query.action) where.action = query.action;
    if (query.channel) where.channel = query.channel;
    if (query.startDate && query.endDate) {
      where.createdAt = Between(query.startDate, query.endDate);
    }

    const [items, total] = await this.auditRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  /**
   * Get all audit entries for a specific resource (its full history).
   */
  async getResourceHistory(resourceType: string, resourceId: string): Promise<AuditLog[]> {
    return this.auditRepo.find({
      where: { resourceType, resourceId },
      order: { createdAt: 'ASC' },
    });
  }
}
