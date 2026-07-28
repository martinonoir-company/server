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
exports.RolesGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const require_permissions_decorator_1 = require("../decorators/require-permissions.decorator");
const public_decorator_1 = require("../decorators/public.decorator");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const role_entity_1 = require("../../modules/users/entities/role.entity");
const user_entity_1 = require("../../modules/users/entities/user.entity");
let RolesGuard = class RolesGuard {
    constructor(reflector, roleRepo) {
        this.reflector = reflector;
        this.roleRepo = roleRepo;
    }
    async canActivate(context) {
        const isPublic = this.reflector.getAllAndOverride(public_decorator_1.IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic)
            return true;
        const requiredPermissions = this.reflector.getAllAndOverride(require_permissions_decorator_1.PERMISSIONS_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!requiredPermissions || requiredPermissions.length === 0) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (!user) {
            throw new common_1.ForbiddenException('Authentication required');
        }
        if (user.role === user_entity_1.UserRole.SUPER_ADMIN) {
            return true;
        }
        let effectivePermissions;
        if (Array.isArray(user.permissions)) {
            effectivePermissions = user.permissions;
        }
        else {
            const roleName = this.mapUserRoleToRoleName(user.role);
            const role = await this.roleRepo.findOne({ where: { name: roleName } });
            if (role) {
                effectivePermissions = role.permissions;
            }
            else {
                const systemRole = role_entity_1.SYSTEM_ROLES.find((r) => r.name === roleName);
                if (!systemRole) {
                    throw new common_1.ForbiddenException('Role not configured');
                }
                effectivePermissions = systemRole.permissions;
            }
        }
        const hasAll = requiredPermissions.every((perm) => effectivePermissions.includes(perm));
        if (!hasAll) {
            const missing = requiredPermissions.filter((p) => !effectivePermissions.includes(p));
            throw new common_1.ForbiddenException(`Insufficient permissions. Missing: ${missing.join(', ')}`);
        }
        return true;
    }
    mapUserRoleToRoleName(userRole) {
        const mapping = {
            [user_entity_1.UserRole.SUPER_ADMIN]: 'SUPER_ADMIN',
            [user_entity_1.UserRole.COMPANY_SUPER_ADMIN]: 'COMPANY_SUPER_ADMIN',
            [user_entity_1.UserRole.COMPANY_STAFF]: 'COMPANY_STAFF',
            [user_entity_1.UserRole.CUSTOMER]: 'CUSTOMER',
            [user_entity_1.UserRole.MARKETING_AGENT]: 'MARKETING_AGENT',
        };
        return mapping[userRole] ?? 'CUSTOMER';
    }
};
exports.RolesGuard = RolesGuard;
exports.RolesGuard = RolesGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, typeorm_1.InjectRepository)(role_entity_1.Role)),
    __metadata("design:paramtypes", [core_1.Reflector,
        typeorm_2.Repository])
], RolesGuard);
//# sourceMappingURL=roles.guard.js.map