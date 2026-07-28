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
exports.AgentAttribution = exports.AgentAttributionStatus = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../shared/entities/base.entity");
const marketing_agent_entity_1 = require("./marketing-agent.entity");
const order_entity_1 = require("../../orders/entities/order.entity");
const agent_payout_entity_1 = require("./agent-payout.entity");
var AgentAttributionStatus;
(function (AgentAttributionStatus) {
    AgentAttributionStatus["PENDING"] = "PENDING";
    AgentAttributionStatus["EARNED"] = "EARNED";
    AgentAttributionStatus["REVERSED"] = "REVERSED";
    AgentAttributionStatus["PAID"] = "PAID";
})(AgentAttributionStatus || (exports.AgentAttributionStatus = AgentAttributionStatus = {}));
let AgentAttribution = class AgentAttribution extends base_entity_1.BaseEntity {
};
exports.AgentAttribution = AgentAttribution;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ type: 'varchar', length: 26 }),
    __metadata("design:type", String)
], AgentAttribution.prototype, "agentId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => marketing_agent_entity_1.MarketingAgent, { onDelete: 'RESTRICT' }),
    (0, typeorm_1.JoinColumn)({ name: 'agentId' }),
    __metadata("design:type", marketing_agent_entity_1.MarketingAgent)
], AgentAttribution.prototype, "agent", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 16 }),
    __metadata("design:type", String)
], AgentAttribution.prototype, "agentCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26 }),
    __metadata("design:type", String)
], AgentAttribution.prototype, "orderId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => order_entity_1.Order, { onDelete: 'RESTRICT' }),
    (0, typeorm_1.JoinColumn)({ name: 'orderId' }),
    __metadata("design:type", order_entity_1.Order)
], AgentAttribution.prototype, "order", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20 }),
    __metadata("design:type", String)
], AgentAttribution.prototype, "orderNumber", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], AgentAttribution.prototype, "orderTotalMinor", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], AgentAttribution.prototype, "commissionRateBps", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], AgentAttribution.prototype, "commissionMinor", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 3, default: 'NGN' }),
    __metadata("design:type", String)
], AgentAttribution.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: AgentAttributionStatus,
        default: AgentAttributionStatus.PENDING,
    }),
    __metadata("design:type", String)
], AgentAttribution.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20 }),
    __metadata("design:type", String)
], AgentAttribution.prototype, "channel", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], AgentAttribution.prototype, "earnedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], AgentAttribution.prototype, "reversedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26, nullable: true }),
    __metadata("design:type", Object)
], AgentAttribution.prototype, "payoutId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => agent_payout_entity_1.AgentPayout, { onDelete: 'SET NULL', nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'payoutId' }),
    __metadata("design:type", Object)
], AgentAttribution.prototype, "payout", void 0);
exports.AgentAttribution = AgentAttribution = __decorate([
    (0, typeorm_1.Entity)('agent_attributions'),
    (0, typeorm_1.Index)(['agentId', 'status', 'createdAt']),
    (0, typeorm_1.Index)(['orderId'], { unique: true })
], AgentAttribution);
//# sourceMappingURL=agent-attribution.entity.js.map