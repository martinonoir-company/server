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
exports.PosSession = exports.PosSessionStatus = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../shared/entities/base.entity");
const branch_entity_1 = require("../../branches/entities/branch.entity");
const terminal_entity_1 = require("../../branches/entities/terminal.entity");
const user_entity_1 = require("../../users/entities/user.entity");
var PosSessionStatus;
(function (PosSessionStatus) {
    PosSessionStatus["ACTIVE"] = "ACTIVE";
    PosSessionStatus["AWAITING_PAYMENT"] = "AWAITING_PAYMENT";
    PosSessionStatus["COMPLETED"] = "COMPLETED";
    PosSessionStatus["VOIDED"] = "VOIDED";
})(PosSessionStatus || (exports.PosSessionStatus = PosSessionStatus = {}));
let PosSession = class PosSession extends base_entity_1.BaseEntity {
};
exports.PosSession = PosSession;
__decorate([
    (0, typeorm_1.Index)('IDX_pos_sessions_terminalId'),
    (0, typeorm_1.Column)({ type: 'varchar', length: 26 }),
    __metadata("design:type", String)
], PosSession.prototype, "terminalId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => terminal_entity_1.Terminal),
    (0, typeorm_1.JoinColumn)({ name: 'terminalId' }),
    __metadata("design:type", terminal_entity_1.Terminal)
], PosSession.prototype, "terminal", void 0);
__decorate([
    (0, typeorm_1.Index)('IDX_pos_sessions_branchId'),
    (0, typeorm_1.Column)({ type: 'varchar', length: 26 }),
    __metadata("design:type", String)
], PosSession.prototype, "branchId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => branch_entity_1.Branch),
    (0, typeorm_1.JoinColumn)({ name: 'branchId' }),
    __metadata("design:type", branch_entity_1.Branch)
], PosSession.prototype, "branch", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26 }),
    __metadata("design:type", String)
], PosSession.prototype, "openedByStaffId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User),
    (0, typeorm_1.JoinColumn)({ name: 'openedByStaffId' }),
    __metadata("design:type", user_entity_1.User)
], PosSession.prototype, "openedByStaff", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: PosSessionStatus,
        default: PosSessionStatus.ACTIVE,
    }),
    __metadata("design:type", String)
], PosSession.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb' }),
    __metadata("design:type", Object)
], PosSession.prototype, "cart", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], PosSession.prototype, "version", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], PosSession.prototype, "openedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], PosSession.prototype, "closedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, nullable: true }),
    __metadata("design:type", Object)
], PosSession.prototype, "resultOrderNumber", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26, nullable: true }),
    __metadata("design:type", Object)
], PosSession.prototype, "resultOrderId", void 0);
exports.PosSession = PosSession = __decorate([
    (0, typeorm_1.Entity)('pos_sessions')
], PosSession);
//# sourceMappingURL=pos-session.entity.js.map