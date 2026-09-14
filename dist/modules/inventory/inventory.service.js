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
var InventoryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const inventory_entity_1 = require("./entities/inventory.entity");
const cache_service_1 = require("../../shared/services/cache.service");
const INBOUND_KINDS = new Set([
    inventory_entity_1.MovementKind.RECEIPT,
    inventory_entity_1.MovementKind.RETURN,
    inventory_entity_1.MovementKind.TRANSFER_IN,
]);
const OUTBOUND_KINDS = new Set([
    inventory_entity_1.MovementKind.SALE,
    inventory_entity_1.MovementKind.ADJUSTMENT,
    inventory_entity_1.MovementKind.TRANSFER_OUT,
]);
let InventoryService = InventoryService_1 = class InventoryService {
    constructor(movementRepo, levelRepo, dataSource, cacheService) {
        this.movementRepo = movementRepo;
        this.levelRepo = levelRepo;
        this.dataSource = dataSource;
        this.cacheService = cacheService;
        this.logger = new common_1.Logger(InventoryService_1.name);
    }
    async recordMovement(input) {
        const movement = await this.dataSource.transaction(async (manager) => {
            const result = await this.recordMovementOnManager(manager, input);
            return result.movement;
        });
        if (this.cacheService) {
            await this.cacheService.invalidateStock(input.variantId);
        }
        return movement;
    }
    async recordMovementOnManager(manager, input) {
        if (input.quantity <= 0) {
            throw new common_1.BadRequestException('Quantity must be positive');
        }
        const warehouse = input.warehouseCode ?? 'DEFAULT';
        if (input.clientLineId) {
            const existing = await manager.findOne(inventory_entity_1.StockMovement, {
                where: { clientLineId: input.clientLineId },
            });
            if (existing) {
                this.logger.debug(`Idempotent skip (clientLineId): variant=${input.variantId} clientLineId=${input.clientLineId}`);
                return { movement: existing, deduplicated: true };
            }
        }
        if (!input.clientLineId && input.referenceId && input.referenceType) {
            const existing = await manager.findOne(inventory_entity_1.StockMovement, {
                where: {
                    referenceId: input.referenceId,
                    referenceType: input.referenceType,
                    variantId: input.variantId,
                    kind: input.kind,
                },
            });
            if (existing) {
                this.logger.debug(`Idempotent skip (reference): ${input.kind} for variant=${input.variantId} ref=${input.referenceId}`);
                return { movement: existing, deduplicated: true };
            }
        }
        await manager
            .createQueryBuilder()
            .insert()
            .into(inventory_entity_1.StockLevel)
            .values({
            variantId: input.variantId,
            warehouseCode: warehouse,
            onHand: 0,
            reserved: 0,
        })
            .orIgnore()
            .execute();
        if (INBOUND_KINDS.has(input.kind)) {
            await manager
                .createQueryBuilder()
                .update(inventory_entity_1.StockLevel)
                .set({
                onHand: () => `"onHand" + :qty`,
                lastMovementAt: new Date(),
            })
                .where('"variantId" = :variantId AND "warehouseCode" = :wh', {
                variantId: input.variantId,
                wh: warehouse,
                qty: input.quantity,
            })
                .execute();
        }
        else if (OUTBOUND_KINDS.has(input.kind)) {
            const result = await manager
                .createQueryBuilder()
                .update(inventory_entity_1.StockLevel)
                .set({
                onHand: () => `"onHand" - :qty`,
                lastMovementAt: new Date(),
            })
                .where('"variantId" = :variantId AND "warehouseCode" = :wh AND "onHand" >= :qty', {
                variantId: input.variantId,
                wh: warehouse,
                qty: input.quantity,
            })
                .execute();
            if (result.affected === 0) {
                const level = await manager.findOne(inventory_entity_1.StockLevel, {
                    where: { variantId: input.variantId, warehouseCode: warehouse },
                });
                throw new common_1.ConflictException(`Insufficient stock for variant ${input.variantId}: have ${level?.onHand ?? 0}, need ${input.quantity}`);
            }
        }
        else if (input.kind === inventory_entity_1.MovementKind.RESERVATION) {
            const result = await manager
                .createQueryBuilder()
                .update(inventory_entity_1.StockLevel)
                .set({
                reserved: () => `"reserved" + :qty`,
                lastMovementAt: new Date(),
            })
                .where('"variantId" = :variantId AND "warehouseCode" = :wh AND ("onHand" - "reserved") >= :qty', {
                variantId: input.variantId,
                wh: warehouse,
                qty: input.quantity,
            })
                .execute();
            if (result.affected === 0) {
                const level = await manager.findOne(inventory_entity_1.StockLevel, {
                    where: { variantId: input.variantId, warehouseCode: warehouse },
                });
                const available = level ? level.onHand - level.reserved : 0;
                throw new common_1.ConflictException(`Insufficient available stock for variant ${input.variantId}: available ${available}, need ${input.quantity}`);
            }
        }
        else if (input.kind === inventory_entity_1.MovementKind.RELEASE) {
            await manager
                .createQueryBuilder()
                .update(inventory_entity_1.StockLevel)
                .set({
                reserved: () => `GREATEST(0, "reserved" - :qty)`,
                lastMovementAt: new Date(),
            })
                .where('"variantId" = :variantId AND "warehouseCode" = :wh', {
                variantId: input.variantId,
                wh: warehouse,
                qty: input.quantity,
            })
                .execute();
        }
        const mvt = manager.create(inventory_entity_1.StockMovement, {
            variantId: input.variantId,
            kind: input.kind,
            quantity: input.quantity,
            warehouseCode: warehouse,
            referenceId: input.referenceId,
            referenceType: input.referenceType,
            reason: input.reason,
            createdBy: input.createdBy,
            clientLineId: input.clientLineId,
        });
        const saved = await manager.save(inventory_entity_1.StockMovement, mvt);
        return { movement: saved, deduplicated: false };
    }
    async recordMovementsBatch(lines, createdBy) {
        if (!lines || lines.length === 0) {
            throw new common_1.BadRequestException('At least one line is required');
        }
        if (lines.length > 500) {
            throw new common_1.BadRequestException('Batch size exceeds maximum (500 lines)');
        }
        const seen = new Set();
        for (const line of lines) {
            if (!line.clientLineId) {
                throw new common_1.BadRequestException('Every batch line requires a clientLineId');
            }
            if (seen.has(line.clientLineId)) {
                throw new common_1.BadRequestException(`Duplicate clientLineId in request: ${line.clientLineId}`);
            }
            seen.add(line.clientLineId);
        }
        const results = [];
        let acceptedCount = 0;
        let deduplicatedCount = 0;
        await this.dataSource.transaction(async (manager) => {
            for (const line of lines) {
                const { movement, deduplicated } = await this.recordMovementOnManager(manager, {
                    variantId: line.variantId,
                    kind: line.kind,
                    quantity: line.quantity,
                    warehouseCode: line.warehouseCode,
                    referenceId: line.referenceId,
                    referenceType: line.referenceType,
                    reason: line.reason,
                    createdBy,
                    clientLineId: line.clientLineId,
                });
                results.push({
                    clientLineId: line.clientLineId,
                    status: deduplicated ? 'DEDUPLICATED' : 'ACCEPTED',
                    movementId: movement.id,
                });
                if (deduplicated)
                    deduplicatedCount++;
                else
                    acceptedCount++;
            }
        });
        if (this.cacheService) {
            const uniqueVariantIds = new Set(lines.map((l) => l.variantId));
            await Promise.all(Array.from(uniqueVariantIds).map((vid) => this.cacheService.invalidateStock(vid)));
        }
        return {
            accepted: acceptedCount,
            deduplicated: deduplicatedCount,
            lines: results,
        };
    }
    async getStockLevel(variantId, warehouseCode = 'DEFAULT') {
        if (this.cacheService) {
            const cacheKey = cache_service_1.CacheService.stockLevelKey(variantId, warehouseCode);
            const cached = await this.cacheService.get(cacheKey);
            if (cached)
                return cached;
        }
        const level = await this.levelRepo.findOne({
            where: { variantId, warehouseCode },
        });
        if (level && this.cacheService) {
            await this.cacheService.set(cache_service_1.CacheService.stockLevelKey(variantId, warehouseCode), level, cache_service_1.CacheService.TTL.STOCK_LEVEL);
        }
        return level;
    }
    async getStockLevels(variantId) {
        return this.levelRepo.find({ where: { variantId } });
    }
    async getAllStockLevels(query) {
        const page = query?.page ?? 1;
        const limit = Math.min(query?.limit ?? 50, 200);
        const skip = (page - 1) * limit;
        const qb = this.levelRepo.createQueryBuilder('sl');
        if (query?.warehouseCode) {
            qb.andWhere('sl."warehouseCode" = :wh', { wh: query.warehouseCode });
        }
        if (query?.lowStockOnly) {
            const threshold = query.lowStockThreshold ?? 5;
            qb.andWhere('(sl."onHand" - sl."reserved") <= :threshold AND sl."onHand" > 0', {
                threshold,
            });
        }
        qb.orderBy('sl."lastMovementAt"', 'DESC');
        qb.skip(skip).take(limit);
        const [items, total] = await qb.getManyAndCount();
        return { items, total, page, limit };
    }
    async getMovementHistory(variantId, limit = 50, offset = 0) {
        const [items, total] = await this.movementRepo.findAndCount({
            where: { variantId },
            order: { createdAt: 'DESC' },
            take: limit,
            skip: offset,
        });
        return { items, total };
    }
    async checkAvailability(items) {
        const results = [];
        for (const item of items) {
            const level = await this.getStockLevel(item.variantId);
            const available = level ? level.onHand - level.reserved : 0;
            results.push({
                variantId: item.variantId,
                available,
                sufficient: available >= item.quantity,
            });
        }
        return results;
    }
};
exports.InventoryService = InventoryService;
exports.InventoryService = InventoryService = InventoryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(inventory_entity_1.StockMovement)),
    __param(1, (0, typeorm_1.InjectRepository)(inventory_entity_1.StockLevel)),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource,
        cache_service_1.CacheService])
], InventoryService);
//# sourceMappingURL=inventory.service.js.map