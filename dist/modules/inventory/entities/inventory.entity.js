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
Object.defineProperty(exports, "__esModule", { value: true });
exports.StockLevel = exports.StockMovement = exports.MovementKind = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../shared/entities/base.entity");
const product_entity_1 = require("../../products/entities/product.entity");
var MovementKind;
(function (MovementKind) {
    MovementKind["RECEIPT"] = "RECEIPT";
    MovementKind["SALE"] = "SALE";
    MovementKind["RESERVATION"] = "RESERVATION";
    MovementKind["RELEASE"] = "RELEASE";
    MovementKind["RETURN"] = "RETURN";
    MovementKind["ADJUSTMENT"] = "ADJUSTMENT";
    MovementKind["TRANSFER_OUT"] = "TRANSFER_OUT";
    MovementKind["TRANSFER_IN"] = "TRANSFER_IN";
})(MovementKind || (exports.MovementKind = MovementKind = {}));
let StockMovement = class StockMovement extends base_entity_1.BaseEntity {
};
exports.StockMovement = StockMovement;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ type: 'varchar', length: 26 }),
    __metadata("design:type", String)
], StockMovement.prototype, "variantId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => product_entity_1.ProductVariant, { onDelete: 'RESTRICT' }),
    (0, typeorm_1.JoinColumn)({ name: 'variantId' }),
    __metadata("design:type", product_entity_1.ProductVariant)
], StockMovement.prototype, "variant", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: MovementKind }),
    __metadata("design:type", String)
], StockMovement.prototype, "kind", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], StockMovement.prototype, "quantity", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, default: 'DEFAULT' }),
    __metadata("design:type", String)
], StockMovement.prototype, "warehouseCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", String)
], StockMovement.prototype, "referenceId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, nullable: true }),
    __metadata("design:type", String)
], StockMovement.prototype, "referenceType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], StockMovement.prototype, "reason", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26, nullable: true }),
    __metadata("design:type", String)
], StockMovement.prototype, "createdBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 36, nullable: true }),
    __metadata("design:type", String)
], StockMovement.prototype, "clientLineId", void 0);
exports.StockMovement = StockMovement = __decorate([
    (0, typeorm_1.Entity)('stock_movements'),
    (0, typeorm_1.Index)(['referenceId', 'referenceType', 'variantId', 'kind'], { unique: true, where: '"referenceId" IS NOT NULL' })
], StockMovement);
let StockLevel = class StockLevel {
    get available() {
        return this.onHand - this.reserved;
    }
};
exports.StockLevel = StockLevel;
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26, primary: true }),
    __metadata("design:type", String)
], StockLevel.prototype, "variantId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => product_entity_1.ProductVariant, { onDelete: 'RESTRICT' }),
    (0, typeorm_1.JoinColumn)({ name: 'variantId' }),
    __metadata("design:type", product_entity_1.ProductVariant)
], StockLevel.prototype, "variant", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, primary: true, default: 'DEFAULT' }),
    __metadata("design:type", String)
], StockLevel.prototype, "warehouseCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], StockLevel.prototype, "onHand", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], StockLevel.prototype, "reserved", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', default: () => 'NOW()' }),
    __metadata("design:type", Date)
], StockLevel.prototype, "lastMovementAt", void 0);
exports.StockLevel = StockLevel = __decorate([
    (0, typeorm_1.Entity)('stock_levels'),
    (0, typeorm_1.Index)(['variantId', 'warehouseCode'], { unique: true })
], StockLevel);
//# sourceMappingURL=inventory.entity.js.map