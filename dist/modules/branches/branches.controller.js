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
exports.BranchesController = void 0;
const common_1 = require("@nestjs/common");
const branches_service_1 = require("./branches.service");
const branch_dto_1 = require("./dto/branch.dto");
const terminal_dto_1 = require("./dto/terminal.dto");
const assign_staff_dto_1 = require("./dto/assign-staff.dto");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
const roles_guard_1 = require("../../shared/guards/roles.guard");
const require_permissions_decorator_1 = require("../../shared/decorators/require-permissions.decorator");
const current_user_decorator_1 = require("../../shared/decorators/current-user.decorator");
const role_entity_1 = require("../users/entities/role.entity");
const user_entity_1 = require("../users/entities/user.entity");
let BranchesController = class BranchesController {
    constructor(branchesService) {
        this.branchesService = branchesService;
    }
    async list(user) {
        const branches = await this.branchesService.listForUser({
            id: user.id,
            role: user.role,
        });
        return { data: branches };
    }
    async getOne(id, user) {
        const branch = await this.branchesService.getByIdForUser(id, {
            id: user.id,
            role: user.role,
        });
        return { data: branch };
    }
    async create(dto) {
        const branch = await this.branchesService.create(dto);
        return { data: branch };
    }
    async update(id, dto) {
        const branch = await this.branchesService.update(id, dto);
        return { data: branch };
    }
    async remove(id) {
        const result = await this.branchesService.softDelete(id);
        return { data: result };
    }
    async listTerminals(id, user) {
        const terminals = await this.branchesService.listTerminals(id, {
            id: user.id,
            role: user.role,
        });
        return { data: terminals };
    }
    async createTerminal(id, dto) {
        const terminal = await this.branchesService.createTerminal(id, dto);
        return { data: terminal };
    }
    async updateTerminal(id, terminalId, dto) {
        const terminal = await this.branchesService.updateTerminal(id, terminalId, dto);
        return { data: terminal };
    }
    async removeTerminal(id, terminalId) {
        const result = await this.branchesService.softDeleteTerminal(id, terminalId);
        return { data: result };
    }
    async listStaff(id) {
        const staff = await this.branchesService.listStaff(id);
        return { data: staff };
    }
    async assignStaff(id, dto) {
        const assignment = await this.branchesService.assignStaff(id, dto.userId);
        return { data: assignment };
    }
    async unassignStaff(id, userId) {
        const result = await this.branchesService.unassignStaff(id, userId);
        return { data: result };
    }
};
exports.BranchesController = BranchesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_entity_1.User]),
    __metadata("design:returntype", Promise)
], BranchesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, user_entity_1.User]),
    __metadata("design:returntype", Promise)
], BranchesController.prototype, "getOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.BRANCHES_MANAGE),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [branch_dto_1.CreateBranchDto]),
    __metadata("design:returntype", Promise)
], BranchesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.BRANCHES_MANAGE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, branch_dto_1.UpdateBranchDto]),
    __metadata("design:returntype", Promise)
], BranchesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.BRANCHES_MANAGE),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BranchesController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)(':id/terminals'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, user_entity_1.User]),
    __metadata("design:returntype", Promise)
], BranchesController.prototype, "listTerminals", null);
__decorate([
    (0, common_1.Post)(':id/terminals'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.BRANCHES_MANAGE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, terminal_dto_1.CreateTerminalDto]),
    __metadata("design:returntype", Promise)
], BranchesController.prototype, "createTerminal", null);
__decorate([
    (0, common_1.Patch)(':id/terminals/:terminalId'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.BRANCHES_MANAGE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('terminalId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, terminal_dto_1.UpdateTerminalDto]),
    __metadata("design:returntype", Promise)
], BranchesController.prototype, "updateTerminal", null);
__decorate([
    (0, common_1.Delete)(':id/terminals/:terminalId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.BRANCHES_MANAGE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('terminalId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], BranchesController.prototype, "removeTerminal", null);
__decorate([
    (0, common_1.Get)(':id/staff'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.BRANCHES_MANAGE),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BranchesController.prototype, "listStaff", null);
__decorate([
    (0, common_1.Post)(':id/staff'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.BRANCHES_MANAGE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, assign_staff_dto_1.AssignStaffDto]),
    __metadata("design:returntype", Promise)
], BranchesController.prototype, "assignStaff", null);
__decorate([
    (0, common_1.Delete)(':id/staff/:userId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.BRANCHES_MANAGE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], BranchesController.prototype, "unassignStaff", null);
exports.BranchesController = BranchesController = __decorate([
    (0, common_1.Controller)({ path: 'branches', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [branches_service_1.BranchesService])
], BranchesController);
//# sourceMappingURL=branches.controller.js.map