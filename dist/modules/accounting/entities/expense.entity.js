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
exports.Expense = exports.ExpenseCategory = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../shared/entities/base.entity");
const user_entity_1 = require("../../users/entities/user.entity");
var ExpenseCategory;
(function (ExpenseCategory) {
    ExpenseCategory["OPERATIONS"] = "OPERATIONS";
    ExpenseCategory["MARKETING"] = "MARKETING";
    ExpenseCategory["LOGISTICS"] = "LOGISTICS";
    ExpenseCategory["SALARIES"] = "SALARIES";
    ExpenseCategory["RENT_AND_UTILITIES"] = "RENT_AND_UTILITIES";
    ExpenseCategory["COGS_ADJUSTMENT"] = "COGS_ADJUSTMENT";
    ExpenseCategory["TAXES"] = "TAXES";
    ExpenseCategory["PROFESSIONAL_FEES"] = "PROFESSIONAL_FEES";
    ExpenseCategory["TRAVEL"] = "TRAVEL";
    ExpenseCategory["EQUIPMENT"] = "EQUIPMENT";
    ExpenseCategory["OTHER"] = "OTHER";
})(ExpenseCategory || (exports.ExpenseCategory = ExpenseCategory = {}));
let Expense = class Expense extends base_entity_1.BaseEntity {
};
exports.Expense = Expense;
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 200 }),
    __metadata("design:type", String)
], Expense.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ type: 'enum', enum: ExpenseCategory }),
    __metadata("design:type", String)
], Expense.prototype, "category", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], Expense.prototype, "amountMinor", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 3, default: 'NGN' }),
    __metadata("design:type", String)
], Expense.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date' }),
    __metadata("design:type", Date)
], Expense.prototype, "incurredAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Expense.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 200, nullable: true }),
    __metadata("design:type", Object)
], Expense.prototype, "vendor", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], Expense.prototype, "referenceNumber", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26 }),
    __metadata("design:type", String)
], Expense.prototype, "createdBy", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'createdBy' }),
    __metadata("design:type", Object)
], Expense.prototype, "createdByUser", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26, nullable: true }),
    __metadata("design:type", Object)
], Expense.prototype, "updatedBy", void 0);
exports.Expense = Expense = __decorate([
    (0, typeorm_1.Entity)('expenses'),
    (0, typeorm_1.Index)(['incurredAt']),
    (0, typeorm_1.Index)(['category', 'incurredAt'])
], Expense);
//# sourceMappingURL=expense.entity.js.map