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
exports.ListStaffQueryDto = exports.TogglePermissionDto = exports.UpdateStaffPermissionsDto = exports.UpdateStaffRoleDto = exports.CreateStaffDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const user_entity_1 = require("../../users/entities/user.entity");
const role_entity_1 = require("../../users/entities/role.entity");
class CreateStaffDto {
}
exports.CreateStaffDto = CreateStaffDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CreateStaffDto.prototype, "firstName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CreateStaffDto.prototype, "lastName", void 0);
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], CreateStaffDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsEnum)([user_entity_1.UserRole.COMPANY_SUPER_ADMIN, user_entity_1.UserRole.COMPANY_STAFF], {
        message: 'Role must be COMPANY_SUPER_ADMIN or COMPANY_STAFF',
    }),
    __metadata("design:type", String)
], CreateStaffDto.prototype, "role", void 0);
class UpdateStaffRoleDto {
}
exports.UpdateStaffRoleDto = UpdateStaffRoleDto;
__decorate([
    (0, class_validator_1.IsEnum)([user_entity_1.UserRole.COMPANY_SUPER_ADMIN, user_entity_1.UserRole.COMPANY_STAFF], {
        message: 'Role must be COMPANY_SUPER_ADMIN or COMPANY_STAFF',
    }),
    __metadata("design:type", String)
], UpdateStaffRoleDto.prototype, "role", void 0);
class UpdateStaffPermissionsDto {
}
exports.UpdateStaffPermissionsDto = UpdateStaffPermissionsDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayUnique)(),
    (0, class_validator_1.IsEnum)(role_entity_1.Permission, { each: true, message: 'Unknown permission in list' }),
    __metadata("design:type", Array)
], UpdateStaffPermissionsDto.prototype, "permissions", void 0);
class TogglePermissionDto {
}
exports.TogglePermissionDto = TogglePermissionDto;
__decorate([
    (0, class_validator_1.IsEnum)(role_entity_1.Permission, { message: 'Unknown permission' }),
    __metadata("design:type", String)
], TogglePermissionDto.prototype, "permission", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], TogglePermissionDto.prototype, "granted", void 0);
class ListStaffQueryDto {
    constructor() {
        this.page = 1;
        this.limit = 20;
    }
}
exports.ListStaffQueryDto = ListStaffQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ListStaffQueryDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], ListStaffQueryDto.prototype, "limit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ListStaffQueryDto.prototype, "search", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(user_entity_1.UserRole),
    __metadata("design:type", String)
], ListStaffQueryDto.prototype, "role", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === true || value === 'true' || value === '1'),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ListStaffQueryDto.prototype, "withDeleted", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === true || value === 'true' || value === '1'),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ListStaffQueryDto.prototype, "suspendedOnly", void 0);
//# sourceMappingURL=staff.dto.js.map