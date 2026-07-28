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
exports.StaffController = void 0;
const common_1 = require("@nestjs/common");
const staff_service_1 = require("./staff.service");
const staff_dto_1 = require("./dto/staff.dto");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
const roles_guard_1 = require("../../shared/guards/roles.guard");
const require_permissions_decorator_1 = require("../../shared/decorators/require-permissions.decorator");
const current_user_decorator_1 = require("../../shared/decorators/current-user.decorator");
const role_entity_1 = require("../users/entities/role.entity");
const user_entity_1 = require("../users/entities/user.entity");
let StaffController = class StaffController {
    constructor(staffService) {
        this.staffService = staffService;
    }
    async listStaff(query) {
        const result = await this.staffService.listStaff(query);
        return { data: result };
    }
    async getStaff(id) {
        const staff = await this.staffService.getStaff(id);
        return { data: staff };
    }
    async createStaff(dto, user) {
        const staff = await this.staffService.createStaff(dto, user);
        return { data: staff };
    }
    async updateRole(id, dto, user) {
        const staff = await this.staffService.updateRole(id, dto, user);
        return { data: staff };
    }
    async replacePermissions(id, dto, user) {
        const staff = await this.staffService.replacePermissions(id, dto, user);
        return { data: staff };
    }
    async togglePermission(id, dto, user) {
        const staff = await this.staffService.togglePermission(id, dto, user);
        return { data: staff };
    }
    async enableAllPermissions(id, user) {
        const staff = await this.staffService.enableAllPermissions(id, user);
        return { data: staff };
    }
    async disableAllPermissions(id, user) {
        const staff = await this.staffService.disableAllPermissions(id, user);
        return { data: staff };
    }
    async suspendStaff(id, user) {
        await this.staffService.suspendStaff(id, user);
        return { data: { suspended: true } };
    }
    async reactivateStaff(id, user) {
        const staff = await this.staffService.reactivateStaff(id, user);
        return { data: staff };
    }
    async deleteStaff(id, user) {
        await this.staffService.deleteStaff(id, user);
    }
};
exports.StaffController = StaffController;
__decorate([
    (0, common_1.Get)(),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.STAFF_READ),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [staff_dto_1.ListStaffQueryDto]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "listStaff", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.STAFF_READ),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "getStaff", null);
__decorate([
    (0, common_1.Post)(),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.STAFF_CREATE),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [staff_dto_1.CreateStaffDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "createStaff", null);
__decorate([
    (0, common_1.Patch)(':id/role'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.STAFF_UPDATE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, staff_dto_1.UpdateStaffRoleDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "updateRole", null);
__decorate([
    (0, common_1.Put)(':id/permissions'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.STAFF_UPDATE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, staff_dto_1.UpdateStaffPermissionsDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "replacePermissions", null);
__decorate([
    (0, common_1.Patch)(':id/permissions'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.STAFF_UPDATE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, staff_dto_1.TogglePermissionDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "togglePermission", null);
__decorate([
    (0, common_1.Post)(':id/permissions/enable-all'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.STAFF_UPDATE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, user_entity_1.User]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "enableAllPermissions", null);
__decorate([
    (0, common_1.Post)(':id/permissions/disable-all'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.STAFF_UPDATE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, user_entity_1.User]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "disableAllPermissions", null);
__decorate([
    (0, common_1.Patch)(':id/suspend'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.STAFF_UPDATE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, user_entity_1.User]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "suspendStaff", null);
__decorate([
    (0, common_1.Patch)(':id/reactivate'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.STAFF_UPDATE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, user_entity_1.User]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "reactivateStaff", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.STAFF_DELETE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, user_entity_1.User]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "deleteStaff", null);
exports.StaffController = StaffController = __decorate([
    (0, common_1.Controller)({ path: 'staff', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [staff_service_1.StaffService])
], StaffController);
//# sourceMappingURL=staff.controller.js.map