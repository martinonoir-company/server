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
exports.PosSyncController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
const pos_sync_service_1 = require("./pos-sync.service");
const inventory_service_1 = require("../inventory/inventory.service");
const pos_sync_dto_1 = require("./dto/pos-sync.dto");
let PosSyncController = class PosSyncController {
    constructor(posSyncService, inventoryService) {
        this.posSyncService = posSyncService;
        this.inventoryService = inventoryService;
    }
    async syncBatch(dto) {
        const result = await this.posSyncService.processBatch(dto);
        return { data: result };
    }
    async getAllStockLevels(page, limit) {
        const result = await this.inventoryService.getAllStockLevels({
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
        });
        return { data: result };
    }
    async getStockLevel(variantId) {
        const level = await this.inventoryService.getStockLevel(variantId);
        return { data: level };
    }
};
exports.PosSyncController = PosSyncController;
__decorate([
    (0, common_1.Post)('sync'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pos_sync_dto_1.PosSyncBatchDto]),
    __metadata("design:returntype", Promise)
], PosSyncController.prototype, "syncBatch", null);
__decorate([
    (0, common_1.Get)('stock'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], PosSyncController.prototype, "getAllStockLevels", null);
__decorate([
    (0, common_1.Get)('stock/:variantId'),
    __param(0, (0, common_1.Param)('variantId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PosSyncController.prototype, "getStockLevel", null);
exports.PosSyncController = PosSyncController = __decorate([
    (0, common_1.Controller)({ path: 'pos', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [pos_sync_service_1.PosSyncService,
        inventory_service_1.InventoryService])
], PosSyncController);
//# sourceMappingURL=pos-sync.controller.js.map