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
exports.VoidSessionDto = exports.ConfirmSessionDto = exports.ConfirmPaymentDto = exports.PaymentIntentDto = exports.UpdateSessionItemDto = exports.AddSessionItemDto = exports.OpenSessionDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class OpenSessionDto {
}
exports.OpenSessionDto = OpenSessionDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['NGN', 'USD']),
    __metadata("design:type", String)
], OpenSessionDto.prototype, "currency", void 0);
class AddSessionItemDto {
}
exports.AddSessionItemDto = AddSessionItemDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(1, 64),
    __metadata("design:type", String)
], AddSessionItemDto.prototype, "clientLineId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(1, 26),
    __metadata("design:type", String)
], AddSessionItemDto.prototype, "variantId", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AddSessionItemDto.prototype, "quantity", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], AddSessionItemDto.prototype, "version", void 0);
class UpdateSessionItemDto {
}
exports.UpdateSessionItemDto = UpdateSessionItemDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateSessionItemDto.prototype, "quantity", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['RETAIL', 'WHOLESALE']),
    __metadata("design:type", String)
], UpdateSessionItemDto.prototype, "priceMode", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateSessionItemDto.prototype, "version", void 0);
class PaymentIntentDto {
}
exports.PaymentIntentDto = PaymentIntentDto;
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], PaymentIntentDto.prototype, "version", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50),
    __metadata("design:type", String)
], PaymentIntentDto.prototype, "couponCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], PaymentIntentDto.prototype, "discountAmount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['COUPON', 'MANUAL']),
    __metadata("design:type", String)
], PaymentIntentDto.prototype, "discountType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], PaymentIntentDto.prototype, "discountAppliedByName", void 0);
class ConfirmPaymentDto {
}
exports.ConfirmPaymentDto = ConfirmPaymentDto;
__decorate([
    (0, class_validator_1.IsEnum)(['CASH', 'POS_TERMINAL', 'BANK_TRANSFER']),
    __metadata("design:type", String)
], ConfirmPaymentDto.prototype, "method", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ConfirmPaymentDto.prototype, "amount", void 0);
class ConfirmSessionDto {
}
exports.ConfirmSessionDto = ConfirmSessionDto;
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ConfirmSessionDto.prototype, "version", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ConfirmPaymentDto),
    __metadata("design:type", Array)
], ConfirmSessionDto.prototype, "payments", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], ConfirmSessionDto.prototype, "customerName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(30),
    __metadata("design:type", String)
], ConfirmSessionDto.prototype, "customerPhone", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(16),
    __metadata("design:type", String)
], ConfirmSessionDto.prototype, "agentCode", void 0);
class VoidSessionDto {
}
exports.VoidSessionDto = VoidSessionDto;
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], VoidSessionDto.prototype, "version", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], VoidSessionDto.prototype, "reason", void 0);
//# sourceMappingURL=pos-session.dto.js.map