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
exports.AccountingAuditLog = exports.AccountingAuditAction = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../shared/entities/base.entity");
const user_entity_1 = require("../../users/entities/user.entity");
var AccountingAuditAction;
(function (AccountingAuditAction) {
    AccountingAuditAction["EXPENSE_CREATED"] = "EXPENSE_CREATED";
    AccountingAuditAction["EXPENSE_UPDATED"] = "EXPENSE_UPDATED";
    AccountingAuditAction["EXPENSE_DELETED"] = "EXPENSE_DELETED";
    AccountingAuditAction["EXPENSE_RESTORED"] = "EXPENSE_RESTORED";
    AccountingAuditAction["REPORT_EXPORTED"] = "REPORT_EXPORTED";
})(AccountingAuditAction || (exports.AccountingAuditAction = AccountingAuditAction = {}));
let AccountingAuditLog = class AccountingAuditLog extends base_entity_1.BaseEntity {
};
exports.AccountingAuditLog = AccountingAuditLog;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ type: 'enum', enum: AccountingAuditAction }),
    __metadata("design:type", String)
], AccountingAuditLog.prototype, "action", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50 }),
    __metadata("design:type", String)
], AccountingAuditLog.prototype, "entityType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26, nullable: true }),
    __metadata("design:type", Object)
], AccountingAuditLog.prototype, "entityId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26 }),
    __metadata("design:type", String)
], AccountingAuditLog.prototype, "actorId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'actorId' }),
    __metadata("design:type", Object)
], AccountingAuditLog.prototype, "actor", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 200 }),
    __metadata("design:type", String)
], AccountingAuditLog.prototype, "actorLabel", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], AccountingAuditLog.prototype, "payload", void 0);
exports.AccountingAuditLog = AccountingAuditLog = __decorate([
    (0, typeorm_1.Entity)('accounting_audit_log'),
    (0, typeorm_1.Index)(['action', 'createdAt']),
    (0, typeorm_1.Index)(['entityType', 'entityId'])
], AccountingAuditLog);
//# sourceMappingURL=accounting-audit-log.entity.js.map