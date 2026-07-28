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
exports.ConfirmUploadDto = exports.ConfirmCategoryUploadDto = exports.PresignUploadDto = exports.MAX_UPLOAD_BYTES = exports.ALLOWED_MIME_TYPES = void 0;
const class_validator_1 = require("class-validator");
exports.ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];
exports.MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
class PresignUploadDto {
}
exports.PresignUploadDto = PresignUploadDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], PresignUploadDto.prototype, "filename", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(exports.ALLOWED_MIME_TYPES, {
        message: 'contentType must be image/jpeg or image/png',
    }),
    __metadata("design:type", String)
], PresignUploadDto.prototype, "contentType", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(exports.MAX_UPLOAD_BYTES, {
        message: `File must be 10 MB or smaller (max ${exports.MAX_UPLOAD_BYTES} bytes)`,
    }),
    __metadata("design:type", Number)
], PresignUploadDto.prototype, "size", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(26),
    __metadata("design:type", String)
], PresignUploadDto.prototype, "productId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(26),
    __metadata("design:type", String)
], PresignUploadDto.prototype, "categoryId", void 0);
class ConfirmCategoryUploadDto {
}
exports.ConfirmCategoryUploadDto = ConfirmCategoryUploadDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], ConfirmCategoryUploadDto.prototype, "key", void 0);
class ConfirmUploadDto {
}
exports.ConfirmUploadDto = ConfirmUploadDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(26),
    __metadata("design:type", String)
], ConfirmUploadDto.prototype, "productId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(26),
    __metadata("design:type", String)
], ConfirmUploadDto.prototype, "variantId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], ConfirmUploadDto.prototype, "key", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(300),
    __metadata("design:type", String)
], ConfirmUploadDto.prototype, "altText", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ConfirmUploadDto.prototype, "sortOrder", void 0);
//# sourceMappingURL=media.dto.js.map