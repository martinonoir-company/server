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
exports.InventoryController = exports.StockLevelQueryDto = exports.RecordMovementBatchDto = exports.RecordMovementBatchLineDto = exports.RecordMovementDto = void 0;
const common_1 = require("@nestjs/common");
const inventory_service_1 = require("./inventory.service");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
const require_permissions_decorator_1 = require("../../shared/decorators/require-permissions.decorator");
const role_entity_1 = require("../users/entities/role.entity");
const class_validator_1 = require("class-validator");
const inventory_entity_1 = require("./entities/inventory.entity");
const class_transformer_1 = require("class-transformer");
class RecordMovementDto {
}
exports.RecordMovementDto = RecordMovementDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RecordMovementDto.prototype, "variantId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(inventory_entity_1.MovementKind),
    __metadata("design:type", String)
], RecordMovementDto.prototype, "kind", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], RecordMovementDto.prototype, "quantity", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RecordMovementDto.prototype, "warehouseCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RecordMovementDto.prototype, "referenceId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RecordMovementDto.prototype, "referenceType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RecordMovementDto.prototype, "reason", void 0);
class RecordMovementBatchLineDto {
}
exports.RecordMovementBatchLineDto = RecordMovementBatchLineDto;
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], RecordMovementBatchLineDto.prototype, "clientLineId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RecordMovementBatchLineDto.prototype, "variantId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(inventory_entity_1.MovementKind),
    __metadata("design:type", String)
], RecordMovementBatchLineDto.prototype, "kind", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], RecordMovementBatchLineDto.prototype, "quantity", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RecordMovementBatchLineDto.prototype, "warehouseCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RecordMovementBatchLineDto.prototype, "referenceId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RecordMovementBatchLineDto.prototype, "referenceType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RecordMovementBatchLineDto.prototype, "reason", void 0);
class RecordMovementBatchDto {
}
exports.RecordMovementBatchDto = RecordMovementBatchDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(500),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => RecordMovementBatchLineDto),
    __metadata("design:type", Array)
], RecordMovementBatchDto.prototype, "lines", void 0);
class StockLevelQueryDto {
}
exports.StockLevelQueryDto = StockLevelQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], StockLevelQueryDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], StockLevelQueryDto.prototype, "limit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], StockLevelQueryDto.prototype, "warehouseCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Boolean),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], StockLevelQueryDto.prototype, "lowStockOnly", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], StockLevelQueryDto.prototype, "lowStockThreshold", void 0);
let InventoryController = class InventoryController {
    constructor(inventoryService) {
        this.inventoryService = inventoryService;
    }
    async recordMovement(dto, req) {
        const input = {
            ...dto,
            createdBy: req.user?.id ?? req.user?.sub,
        };
        const movement = await this.inventoryService.recordMovement(input);
        return { data: movement };
    }
    async recordMovementsBatch(dto, req) {
        const createdBy = req.user?.id ?? req.user?.sub;
        const lines = dto.lines.map((l) => ({
            clientLineId: l.clientLineId,
            variantId: l.variantId,
            kind: l.kind,
            quantity: l.quantity,
            warehouseCode: l.warehouseCode,
            referenceId: l.referenceId,
            referenceType: l.referenceType,
            reason: l.reason,
        }));
        const result = await this.inventoryService.recordMovementsBatch(lines, createdBy);
        return { data: result };
    }
    async getAllStockLevels(query) {
        const result = await this.inventoryService.getAllStockLevels(query);
        return { data: result };
    }
    async getStockLevel(variantId, warehouse) {
        const level = await this.inventoryService.getStockLevel(variantId, warehouse);
        return { data: level };
    }
    async getMovementHistory(variantId, limit) {
        const result = await this.inventoryService.getMovementHistory(variantId, limit);
        return { data: result };
    }
};
exports.InventoryController = InventoryController;
__decorate([
    (0, common_1.Post)('movements'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.INVENTORY_ADJUST),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [RecordMovementDto, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "recordMovement", null);
__decorate([
    (0, common_1.Post)('movements/batch'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.INVENTORY_ADJUST),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [RecordMovementBatchDto, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "recordMovementsBatch", null);
__decorate([
    (0, common_1.Get)('levels'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [StockLevelQueryDto]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "getAllStockLevels", null);
__decorate([
    (0, common_1.Get)('levels/:variantId'),
    __param(0, (0, common_1.Param)('variantId')),
    __param(1, (0, common_1.Query)('warehouse')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "getStockLevel", null);
__decorate([
    (0, common_1.Get)('movements/:variantId'),
    __param(0, (0, common_1.Param)('variantId')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "getMovementHistory", null);
exports.InventoryController = InventoryController = __decorate([
    (0, common_1.Controller)({ path: 'inventory', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [inventory_service_1.InventoryService])
], InventoryController);
//# sourceMappingURL=inventory.controller.js.map