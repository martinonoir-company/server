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
exports.AccountingController = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
const require_permissions_decorator_1 = require("../../shared/decorators/require-permissions.decorator");
const role_entity_1 = require("../users/entities/role.entity");
const current_user_decorator_1 = require("../../shared/decorators/current-user.decorator");
const user_entity_1 = require("../users/entities/user.entity");
const accounting_service_1 = require("./accounting.service");
const expense_entity_1 = require("./entities/expense.entity");
const accounting_audit_log_entity_1 = require("./entities/accounting-audit-log.entity");
class DateRangeQueryDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], DateRangeQueryDto.prototype, "from", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], DateRangeQueryDto.prototype, "to", void 0);
class ListExpensesQueryDto extends DateRangeQueryDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ListExpensesQueryDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ListExpensesQueryDto.prototype, "limit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(expense_entity_1.ExpenseCategory),
    __metadata("design:type", String)
], ListExpensesQueryDto.prototype, "category", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ListExpensesQueryDto.prototype, "search", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ListExpensesQueryDto.prototype, "includeDeleted", void 0);
class CreateExpenseDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateExpenseDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(expense_entity_1.ExpenseCategory),
    __metadata("design:type", String)
], CreateExpenseDto.prototype, "category", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateExpenseDto.prototype, "amountMinor", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateExpenseDto.prototype, "incurredAt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateExpenseDto.prototype, "notes", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateExpenseDto.prototype, "vendor", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateExpenseDto.prototype, "referenceNumber", void 0);
class UpdateExpenseDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], UpdateExpenseDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(expense_entity_1.ExpenseCategory),
    __metadata("design:type", String)
], UpdateExpenseDto.prototype, "category", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], UpdateExpenseDto.prototype, "amountMinor", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], UpdateExpenseDto.prototype, "incurredAt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], UpdateExpenseDto.prototype, "notes", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], UpdateExpenseDto.prototype, "vendor", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], UpdateExpenseDto.prototype, "referenceNumber", void 0);
class ListAuditQueryDto extends DateRangeQueryDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ListAuditQueryDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ListAuditQueryDto.prototype, "limit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(accounting_audit_log_entity_1.AccountingAuditAction),
    __metadata("design:type", String)
], ListAuditQueryDto.prototype, "action", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ListAuditQueryDto.prototype, "entityType", void 0);
let AccountingController = class AccountingController {
    constructor(accountingService) {
        this.accountingService = accountingService;
    }
    async dashboard(q) {
        return { data: await this.accountingService.dashboard(q.from, q.to) };
    }
    async pnl(q) {
        return { data: await this.accountingService.pnl(q.from, q.to) };
    }
    async vatReport(q) {
        return { data: await this.accountingService.vatReport(q.from, q.to) };
    }
    async exportPnl(q, user) {
        const data = await this.accountingService.pnl(q.from, q.to);
        await this.accountingService.logExport(user, {
            kind: 'PNL',
            range: { from: data.range.from, to: data.range.to },
        });
        return { data };
    }
    async listExpenses(q) {
        return {
            data: await this.accountingService.listExpenses({
                page: q.page,
                limit: q.limit,
                from: q.from,
                to: q.to,
                category: q.category,
                search: q.search,
                includeDeleted: q.includeDeleted === 'true',
            }),
        };
    }
    async createExpense(dto, user) {
        return { data: await this.accountingService.createExpense(user, dto) };
    }
    async updateExpense(id, dto, user) {
        return {
            data: await this.accountingService.updateExpense(user, id, dto),
        };
    }
    async deleteExpense(id, user) {
        await this.accountingService.deleteExpense(user, id);
        return { data: { ok: true } };
    }
    async restoreExpense(id, user) {
        return {
            data: await this.accountingService.restoreExpense(user, id),
        };
    }
    async listAudit(q) {
        return {
            data: await this.accountingService.listAuditLog({
                page: q.page,
                limit: q.limit,
                action: q.action,
                entityType: q.entityType,
                from: q.from,
                to: q.to,
            }),
        };
    }
};
exports.AccountingController = AccountingController;
__decorate([
    (0, common_1.Get)('dashboard'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.ACCOUNTING_VIEW),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [DateRangeQueryDto]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "dashboard", null);
__decorate([
    (0, common_1.Get)('pnl'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.ACCOUNTING_VIEW),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [DateRangeQueryDto]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "pnl", null);
__decorate([
    (0, common_1.Get)('vat-report'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.ACCOUNTING_VIEW),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [DateRangeQueryDto]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "vatReport", null);
__decorate([
    (0, common_1.Post)('pnl/export'),
    (0, common_1.HttpCode)(200),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.ACCOUNTING_VIEW),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [DateRangeQueryDto, user_entity_1.User]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "exportPnl", null);
__decorate([
    (0, common_1.Get)('expenses'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.ACCOUNTING_VIEW),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ListExpensesQueryDto]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "listExpenses", null);
__decorate([
    (0, common_1.Post)('expenses'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.ACCOUNTING_MANAGE),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateExpenseDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "createExpense", null);
__decorate([
    (0, common_1.Put)('expenses/:id'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.ACCOUNTING_MANAGE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateExpenseDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "updateExpense", null);
__decorate([
    (0, common_1.Delete)('expenses/:id'),
    (0, common_1.HttpCode)(200),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.ACCOUNTING_MANAGE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, user_entity_1.User]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "deleteExpense", null);
__decorate([
    (0, common_1.Post)('expenses/:id/restore'),
    (0, common_1.HttpCode)(200),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.ACCOUNTING_MANAGE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, user_entity_1.User]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "restoreExpense", null);
__decorate([
    (0, common_1.Get)('audit'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.ACCOUNTING_VIEW),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ListAuditQueryDto]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "listAudit", null);
exports.AccountingController = AccountingController = __decorate([
    (0, common_1.Controller)({ path: 'accounting', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [accounting_service_1.AccountingService])
], AccountingController);
//# sourceMappingURL=accounting.controller.js.map