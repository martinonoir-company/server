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
exports.AgentPayout = exports.AgentPayoutStatus = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../shared/entities/base.entity");
const marketing_agent_entity_1 = require("./marketing-agent.entity");
const agent_attribution_entity_1 = require("./agent-attribution.entity");
var AgentPayoutStatus;
(function (AgentPayoutStatus) {
    AgentPayoutStatus["PENDING"] = "PENDING";
    AgentPayoutStatus["PROCESSING"] = "PROCESSING";
    AgentPayoutStatus["SUCCEEDED"] = "SUCCEEDED";
    AgentPayoutStatus["FAILED"] = "FAILED";
})(AgentPayoutStatus || (exports.AgentPayoutStatus = AgentPayoutStatus = {}));
let AgentPayout = class AgentPayout extends base_entity_1.BaseEntity {
};
exports.AgentPayout = AgentPayout;
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26 }),
    __metadata("design:type", String)
], AgentPayout.prototype, "agentId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => marketing_agent_entity_1.MarketingAgent, { onDelete: 'RESTRICT' }),
    (0, typeorm_1.JoinColumn)({ name: 'agentId' }),
    __metadata("design:type", marketing_agent_entity_1.MarketingAgent)
], AgentPayout.prototype, "agent", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], AgentPayout.prototype, "amountMinor", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 3, default: 'NGN' }),
    __metadata("design:type", String)
], AgentPayout.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], AgentPayout.prototype, "attributionCount", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: AgentPayoutStatus,
        default: AgentPayoutStatus.PENDING,
    }),
    __metadata("design:type", String)
], AgentPayout.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 10 }),
    __metadata("design:type", String)
], AgentPayout.prototype, "bankCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20 }),
    __metadata("design:type", String)
], AgentPayout.prototype, "bankAccountNumber", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 200 }),
    __metadata("design:type", String)
], AgentPayout.prototype, "bankAccountName", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], AgentPayout.prototype, "providerReference", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], AgentPayout.prototype, "transferRecipientCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], AgentPayout.prototype, "failureReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], AgentPayout.prototype, "paidAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26 }),
    __metadata("design:type", String)
], AgentPayout.prototype, "initiatedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], AgentPayout.prototype, "periodStart", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], AgentPayout.prototype, "periodEnd", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], AgentPayout.prototype, "rawProviderData", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => agent_attribution_entity_1.AgentAttribution, (a) => a.payout),
    __metadata("design:type", Array)
], AgentPayout.prototype, "attributions", void 0);
exports.AgentPayout = AgentPayout = __decorate([
    (0, typeorm_1.Entity)('agent_payouts'),
    (0, typeorm_1.Index)(['agentId', 'createdAt']),
    (0, typeorm_1.Index)(['status'])
], AgentPayout);
//# sourceMappingURL=agent-payout.entity.js.map