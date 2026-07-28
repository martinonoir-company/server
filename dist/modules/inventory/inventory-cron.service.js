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
var InventoryCronService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryCronService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const inventory_entity_1 = require("./entities/inventory.entity");
const product_entity_1 = require("../products/entities/product.entity");
const inventory_service_1 = require("./inventory.service");
const email_service_1 = require("../notifications/email.service");
let InventoryCronService = InventoryCronService_1 = class InventoryCronService {
    constructor(movementRepo, levelRepo, variantRepo, inventoryService, emailService) {
        this.movementRepo = movementRepo;
        this.levelRepo = levelRepo;
        this.variantRepo = variantRepo;
        this.inventoryService = inventoryService;
        this.emailService = emailService;
        this.logger = new common_1.Logger(InventoryCronService_1.name);
        this.RESERVATION_TTL_MINUTES = 15;
        this.LOW_STOCK_THRESHOLD = 5;
        this.ADMIN_ALERT_EMAIL = process.env['ADMIN_ALERT_EMAIL'] ?? 'martinonoirbag@gmail.com';
        this.lastAlerted = new Map();
        this.ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
    }
    async expireReservations() {
        const cutoff = new Date(Date.now() - this.RESERVATION_TTL_MINUTES * 60 * 1000);
        const expiredReservations = await this.movementRepo
            .createQueryBuilder('m')
            .where('m.kind = :kind', { kind: inventory_entity_1.MovementKind.RESERVATION })
            .andWhere('m.createdAt < :cutoff', { cutoff })
            .andWhere(`NOT EXISTS (
          SELECT 1 FROM stock_movements rel
          WHERE rel.kind IN (:...releaseKinds)
          AND rel."referenceId" = m."referenceId"
          AND rel."referenceType" = m."referenceType"
          AND rel."variantId" = m."variantId"
        )`, { releaseKinds: [inventory_entity_1.MovementKind.RELEASE, inventory_entity_1.MovementKind.SALE] })
            .getMany();
        if (expiredReservations.length === 0)
            return;
        this.logger.warn(`Found ${expiredReservations.length} expired reservation(s). Releasing...`);
        for (const reservation of expiredReservations) {
            try {
                await this.inventoryService.recordMovement({
                    variantId: reservation.variantId,
                    kind: inventory_entity_1.MovementKind.RELEASE,
                    quantity: reservation.quantity,
                    referenceId: reservation.referenceId,
                    referenceType: reservation.referenceType,
                    reason: `Auto-released: reservation expired after ${this.RESERVATION_TTL_MINUTES} minutes`,
                });
                this.logger.log(`Released expired reservation: variant=${reservation.variantId}, qty=${reservation.quantity}`);
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`Failed to release reservation ${reservation.id}: ${msg}`);
            }
        }
    }
    async checkLowStock() {
        const lowStockLevels = await this.levelRepo
            .createQueryBuilder('sl')
            .where('(sl.onHand - sl.reserved) <= :threshold', {
            threshold: this.LOW_STOCK_THRESHOLD,
        })
            .andWhere('sl.onHand > 0')
            .getMany();
        for (const level of lowStockLevels) {
            const available = level.onHand - level.reserved;
            this.logger.warn(`LOW STOCK: variant=${level.variantId}, warehouse=${level.warehouseCode}, available=${available}`);
            const lastTime = this.lastAlerted.get(level.variantId) ?? 0;
            if (Date.now() - lastTime < this.ALERT_COOLDOWN_MS)
                continue;
            try {
                const variant = await this.variantRepo.findOne({ where: { id: level.variantId } });
                if (!variant)
                    continue;
                await this.emailService.sendLowStockAlert(this.ADMIN_ALERT_EMAIL, variant.sku, variant.name ?? variant.sku, available);
                this.lastAlerted.set(level.variantId, Date.now());
                this.logger.log(`Low stock alert sent for ${variant.sku} (${variant.name})`);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                this.logger.error(`Failed to send low stock alert for ${level.variantId}: ${msg}`);
            }
        }
    }
};
exports.InventoryCronService = InventoryCronService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_MINUTE),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], InventoryCronService.prototype, "expireReservations", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], InventoryCronService.prototype, "checkLowStock", null);
exports.InventoryCronService = InventoryCronService = InventoryCronService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(inventory_entity_1.StockMovement)),
    __param(1, (0, typeorm_1.InjectRepository)(inventory_entity_1.StockLevel)),
    __param(2, (0, typeorm_1.InjectRepository)(product_entity_1.ProductVariant)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        inventory_service_1.InventoryService,
        email_service_1.EmailService])
], InventoryCronService);
//# sourceMappingURL=inventory-cron.service.js.map