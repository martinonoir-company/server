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
exports.OrderRating = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../shared/entities/base.entity");
const user_entity_1 = require("../../users/entities/user.entity");
const order_entity_1 = require("../../orders/entities/order.entity");
let OrderRating = class OrderRating extends base_entity_1.BaseEntity {
};
exports.OrderRating = OrderRating;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ type: 'varchar', length: 26 }),
    __metadata("design:type", String)
], OrderRating.prototype, "orderId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => order_entity_1.Order, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'orderId' }),
    __metadata("design:type", order_entity_1.Order)
], OrderRating.prototype, "order", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ type: 'varchar', length: 26 }),
    __metadata("design:type", String)
], OrderRating.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'userId' }),
    __metadata("design:type", user_entity_1.User)
], OrderRating.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'smallint' }),
    __metadata("design:type", Number)
], OrderRating.prototype, "stars", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 1000, nullable: true }),
    __metadata("design:type", Object)
], OrderRating.prototype, "comment", void 0);
exports.OrderRating = OrderRating = __decorate([
    (0, typeorm_1.Entity)('order_ratings'),
    (0, typeorm_1.Unique)('UQ_order_ratings_order', ['orderId'])
], OrderRating);
//# sourceMappingURL=order-rating.entity.js.map