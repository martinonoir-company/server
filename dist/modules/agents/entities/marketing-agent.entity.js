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
exports.MarketingAgent = exports.AgentStatus = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../shared/entities/base.entity");
const user_entity_1 = require("../../users/entities/user.entity");
var AgentStatus;
(function (AgentStatus) {
    AgentStatus["PENDING_APPROVAL"] = "PENDING_APPROVAL";
    AgentStatus["APPROVED"] = "APPROVED";
    AgentStatus["REJECTED"] = "REJECTED";
    AgentStatus["SUSPENDED"] = "SUSPENDED";
})(AgentStatus || (exports.AgentStatus = AgentStatus = {}));
let MarketingAgent = class MarketingAgent extends base_entity_1.BaseEntity {
};
exports.MarketingAgent = MarketingAgent;
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ type: 'varchar', length: 26 }),
    __metadata("design:type", String)
], MarketingAgent.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.OneToOne)(() => user_entity_1.User, { onDelete: 'RESTRICT' }),
    (0, typeorm_1.JoinColumn)({ name: 'userId' }),
    __metadata("design:type", user_entity_1.User)
], MarketingAgent.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ type: 'varchar', length: 16 }),
    __metadata("design:type", String)
], MarketingAgent.prototype, "code", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 10 }),
    __metadata("design:type", String)
], MarketingAgent.prototype, "bankCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20 }),
    __metadata("design:type", String)
], MarketingAgent.prototype, "bankAccountNumber", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 200 }),
    __metadata("design:type", String)
], MarketingAgent.prototype, "bankAccountName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], MarketingAgent.prototype, "transferRecipientCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: AgentStatus, default: AgentStatus.PENDING_APPROVAL }),
    __metadata("design:type", String)
], MarketingAgent.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26, nullable: true }),
    __metadata("design:type", Object)
], MarketingAgent.prototype, "decidedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], MarketingAgent.prototype, "decidedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], MarketingAgent.prototype, "decisionReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', nullable: true }),
    __metadata("design:type", Object)
], MarketingAgent.prototype, "commissionRateBps", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint', default: 0 }),
    __metadata("design:type", Number)
], MarketingAgent.prototype, "walletBalanceMinor", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint', default: 0 }),
    __metadata("design:type", Number)
], MarketingAgent.prototype, "lifetimeEarnedMinor", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint', default: 0 }),
    __metadata("design:type", Number)
], MarketingAgent.prototype, "lifetimePaidMinor", void 0);
exports.MarketingAgent = MarketingAgent = __decorate([
    (0, typeorm_1.Entity)('marketing_agents'),
    (0, typeorm_1.Index)(['status'])
], MarketingAgent);
//# sourceMappingURL=marketing-agent.entity.js.map