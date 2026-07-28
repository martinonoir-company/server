"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const audit_log_entity_1 = require("./entities/audit-log.entity");
let AuditService = class AuditService {
    constructor(auditRepo) {
        this.auditRepo = auditRepo;
    }
    async log(input) {
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
    static computeChanges(previous, current) {
        const changes = {};
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
    async findAll(query) {
        const page = query.page ?? 1;
        const limit = Math.min(query.limit ?? 50, 200);
        const skip = (page - 1) * limit;
        const where = {};
        if (query.actorId)
            where.actorId = query.actorId;
        if (query.resourceType)
            where.resourceType = query.resourceType;
        if (query.resourceId)
            where.resourceId = query.resourceId;
        if (query.action)
            where.action = query.action;
        if (query.channel)
            where.channel = query.channel;
        if (query.startDate && query.endDate) {
            where.createdAt = (0, typeorm_2.Between)(query.startDate, query.endDate);
        }
        const [items, total] = await this.auditRepo.findAndCount({
            where,
            order: { createdAt: 'DESC' },
            skip,
            take: limit,
        });
        return { items, total, page, limit, pages: Math.ceil(total / limit) };
    }
    async getResourceHistory(resourceType, resourceId) {
        return this.auditRepo.find({
            where: { resourceType, resourceId },
            order: { createdAt: 'ASC' },
        });
    }
};
exports.AuditService = AuditService;
exports.AuditService = AuditService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(audit_log_entity_1.AuditLog)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], AuditService);
//# sourceMappingURL=audit.service.js.map