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
var RefundsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefundsController = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
const require_permissions_decorator_1 = require("../../shared/decorators/require-permissions.decorator");
const role_entity_1 = require("../users/entities/role.entity");
const current_user_decorator_1 = require("../../shared/decorators/current-user.decorator");
const user_entity_1 = require("../users/entities/user.entity");
const refunds_service_1 = require("./refunds.service");
const paystack_provider_1 = require("../payments/providers/paystack.provider");
class RefundLineDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefundLineDto.prototype, "clientLineId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefundLineDto.prototype, "variantId", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], RefundLineDto.prototype, "quantity", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefundLineDto.prototype, "orderItemId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefundLineDto.prototype, "reasonCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefundLineDto.prototype, "reasonNote", void 0);
class CreateRefundFromReturnDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRefundFromReturnDto.prototype, "orderId", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => RefundLineDto),
    __metadata("design:type", Array)
], CreateRefundFromReturnDto.prototype, "lines", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRefundFromReturnDto.prototype, "warehouseCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRefundFromReturnDto.prototype, "reason", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateRefundFromReturnDto.prototype, "posCashRefund", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateRefundFromReturnDto.prototype, "bankDetails", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateRefundFromReturnDto.prototype, "customAmount", void 0);
class ApproveRefundDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ApproveRefundDto.prototype, "amount", void 0);
class VerifyBankAccountDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], VerifyBankAccountDto.prototype, "accountNumber", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], VerifyBankAccountDto.prototype, "bankCode", void 0);
class RejectRefundDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RejectRefundDto.prototype, "decisionReason", void 0);
let RefundsController = RefundsController_1 = class RefundsController {
    constructor(refundsService, paystack) {
        this.refundsService = refundsService;
        this.paystack = paystack;
        this.logger = new common_1.Logger(RefundsController_1.name);
    }
    async lookupOrder(orderNumber) {
        const data = await this.refundsService.lookupOrderForReturn(orderNumber);
        return { data };
    }
    async create(dto, user) {
        const refund = await this.refundsService.createFromReturn({
            orderId: dto.orderId,
            lines: dto.lines,
            warehouseCode: dto.warehouseCode,
            reason: dto.reason,
            posCashRefund: dto.posCashRefund,
            bankDetails: dto.bankDetails,
            customAmount: dto.customAmount,
            createdBy: user.id,
        });
        return { data: refund };
    }
    async verifyBankAccount(dto) {
        const res = await this.paystack.resolveBankAccount({
            accountNumber: dto.accountNumber,
            bankCode: dto.bankCode,
        });
        if ('error' in res) {
            return { data: { ok: false, error: res.error } };
        }
        return { data: { ok: true, accountName: res.accountName } };
    }
    async listBanks() {
        const banks = await this.paystack.listBanks();
        return { data: banks };
    }
    async list(page, limit, status, channel, search) {
        const data = await this.refundsService.list({
            page: page ? parseInt(page, 10) || 1 : 1,
            limit: limit ? parseInt(limit, 10) || 20 : 20,
            status: status ? status : undefined,
            channel: channel ? channel : undefined,
            search: search || undefined,
        });
        return { data };
    }
    async findOne(id) {
        const data = await this.refundsService.findById(id);
        return { data };
    }
    async approve(id, dto, user) {
        const data = await this.refundsService.approve(id, user.id, dto.amount);
        return { data };
    }
    async reject(id, dto, user) {
        const data = await this.refundsService.reject(id, user.id, dto.decisionReason);
        return { data };
    }
    async retry(id) {
        const data = await this.refundsService.execute(id);
        return { data };
    }
};
exports.RefundsController = RefundsController;
__decorate([
    (0, common_1.Get)('order-lookup/:orderNumber'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.INVENTORY_ADJUST),
    __param(0, (0, common_1.Param)('orderNumber')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RefundsController.prototype, "lookupOrder", null);
__decorate([
    (0, common_1.Post)(),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.INVENTORY_ADJUST),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateRefundFromReturnDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], RefundsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('verify-bank-account'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.INVENTORY_ADJUST),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [VerifyBankAccountDto]),
    __metadata("design:returntype", Promise)
], RefundsController.prototype, "verifyBankAccount", null);
__decorate([
    (0, common_1.Get)('banks'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.INVENTORY_ADJUST),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RefundsController.prototype, "listBanks", null);
__decorate([
    (0, common_1.Get)(),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.REFUNDS_VIEW),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('channel')),
    __param(4, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], RefundsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.REFUNDS_VIEW),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RefundsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(':id/approve'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.REFUNDS_PROCESS),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, ApproveRefundDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], RefundsController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)(':id/reject'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.REFUNDS_PROCESS),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, RejectRefundDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], RefundsController.prototype, "reject", null);
__decorate([
    (0, common_1.Post)(':id/retry'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.REFUNDS_PROCESS),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RefundsController.prototype, "retry", null);
exports.RefundsController = RefundsController = RefundsController_1 = __decorate([
    (0, common_1.Controller)({ path: 'refunds', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [refunds_service_1.RefundsService,
        paystack_provider_1.PaystackProvider])
], RefundsController);
//# sourceMappingURL=refunds.controller.js.map