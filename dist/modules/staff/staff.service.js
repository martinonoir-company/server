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
exports.StaffService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("../users/entities/user.entity");
const role_entity_1 = require("../users/entities/role.entity");
const auth_service_1 = require("../auth/auth.service");
let StaffService = class StaffService {
    constructor(userRepo, authService, dataSource) {
        this.userRepo = userRepo;
        this.authService = authService;
        this.dataSource = dataSource;
    }
    async listStaff(query) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;
        const qb = this.userRepo
            .createQueryBuilder('user')
            .where('user.role NOT IN (:...nonStaff)', {
            nonStaff: [user_entity_1.UserRole.CUSTOMER, user_entity_1.UserRole.MARKETING_AGENT],
        })
            .orderBy('user.createdAt', 'DESC')
            .skip(skip)
            .take(limit);
        if (query.withDeleted || query.suspendedOnly) {
            qb.withDeleted();
        }
        if (query.suspendedOnly) {
            qb.andWhere('user.deletedAt IS NOT NULL');
        }
        if (query.search) {
            const q = `%${query.search}%`;
            qb.andWhere('(user.firstName ILIKE :q OR user.lastName ILIKE :q OR user.email ILIKE :q)', { q });
        }
        if (query.role) {
            qb.andWhere('user.role = :role', { role: query.role });
        }
        const [items, total] = await qb.getManyAndCount();
        return {
            items: items.map((u) => this.sanitize(u)),
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
        };
    }
    async getStaff(id) {
        const user = await this.loadStaffOrThrow(id, { allowSuspended: true });
        return this.sanitize(user);
    }
    async createStaff(dto, inviter) {
        const inviterName = `${inviter.firstName} ${inviter.lastName}`;
        const user = await this.authService.createStaffAccount({
            firstName: dto.firstName,
            lastName: dto.lastName,
            email: dto.email,
            role: dto.role,
        }, inviterName);
        return this.sanitize(user);
    }
    async updateRole(id, dto, requestingUser) {
        const target = await this.loadStaffOrThrow(id, { allowSuspended: true });
        this.assertMutableTarget(target, requestingUser, 'change role');
        await this.userRepo.update(id, { role: dto.role });
        return this.sanitize({ ...target, role: dto.role });
    }
    async replacePermissions(id, dto, requestingUser) {
        const target = await this.loadStaffOrThrow(id, { allowSuspended: true });
        this.assertMutableTarget(target, requestingUser, 'update permissions');
        const unique = Array.from(new Set(dto.permissions));
        await this.userRepo.update(id, { permissions: unique });
        return this.sanitize({ ...target, permissions: unique });
    }
    async togglePermission(id, dto, requestingUser) {
        const target = await this.loadStaffOrThrow(id, { allowSuspended: true });
        this.assertMutableTarget(target, requestingUser, 'update permissions');
        const current = new Set(target.permissions ?? []);
        if (dto.granted)
            current.add(dto.permission);
        else
            current.delete(dto.permission);
        const next = Array.from(current);
        await this.userRepo.update(id, { permissions: next });
        return this.sanitize({ ...target, permissions: next });
    }
    async enableAllPermissions(id, requestingUser) {
        const target = await this.loadStaffOrThrow(id, { allowSuspended: true });
        this.assertMutableTarget(target, requestingUser, 'update permissions');
        const all = Object.values(role_entity_1.Permission);
        await this.userRepo.update(id, { permissions: all });
        return this.sanitize({ ...target, permissions: all });
    }
    async disableAllPermissions(id, requestingUser) {
        const target = await this.loadStaffOrThrow(id, { allowSuspended: true });
        this.assertMutableTarget(target, requestingUser, 'update permissions');
        await this.userRepo.update(id, { permissions: [] });
        return this.sanitize({ ...target, permissions: [] });
    }
    async suspendStaff(id, requestingUser) {
        const target = await this.loadStaffOrThrow(id, { allowSuspended: false });
        this.assertMutableTarget(target, requestingUser, 'suspend');
        if (target.deletedAt) {
            throw new common_1.BadRequestException('Account is already suspended');
        }
        await this.userRepo.softDelete(id);
        await this.authService.logoutAll(id);
    }
    async reactivateStaff(id, requestingUser) {
        const target = await this.loadStaffOrThrow(id, { allowSuspended: true });
        this.assertMutableTarget(target, requestingUser, 'reactivate');
        if (!target.deletedAt) {
            throw new common_1.BadRequestException('Account is not suspended');
        }
        await this.userRepo.restore(id);
        return this.sanitize({ ...target, deletedAt: undefined });
    }
    async deleteStaff(id, requestingUser) {
        const target = await this.loadStaffOrThrow(id, { allowSuspended: true });
        this.assertMutableTarget(target, requestingUser, 'delete');
        await this.authService.logoutAll(id);
        await this.dataSource.transaction(async (manager) => {
            await manager.query('DELETE FROM user_branches WHERE "userId" = $1', [id]);
            const [{ count }] = (await manager.query('SELECT COUNT(*)::int AS count FROM pos_sessions WHERE "openedByStaffId" = $1', [id]));
            if (count === 0) {
                await manager.delete(user_entity_1.User, id);
                return;
            }
            for (const table of [
                'cart_items',
                'wishlist_items',
                'push_tokens',
                'refresh_tokens',
                'email_verification_tokens',
                'password_reset_tokens',
            ]) {
                await manager.query(`DELETE FROM ${table} WHERE "userId" = $1`, [id]);
            }
            const tombstone = `deleted+${id}@deleted.martinonoir.local`;
            await manager.update(user_entity_1.User, { id }, {
                email: tombstone,
                firstName: 'Deleted',
                lastName: 'Staff',
                phone: undefined,
                avatarUrl: undefined,
                passwordHash: '',
                totpSecret: undefined,
                twoFactorEnabled: false,
                backupCodes: undefined,
                emailVerified: false,
                permissions: undefined,
            });
            await manager.softDelete(user_entity_1.User, id);
        });
    }
    async loadStaffOrThrow(id, opts) {
        const user = await this.userRepo.findOne({
            where: { id },
            withDeleted: opts.allowSuspended,
        });
        if (!user ||
            user.role === user_entity_1.UserRole.CUSTOMER ||
            user.role === user_entity_1.UserRole.MARKETING_AGENT) {
            throw new common_1.NotFoundException('Staff member not found');
        }
        return user;
    }
    assertMutableTarget(target, requestingUser, action) {
        if (target.role === user_entity_1.UserRole.SUPER_ADMIN) {
            throw new common_1.ForbiddenException(`Cannot ${action} a SUPER_ADMIN`);
        }
        if (target.id === requestingUser.id) {
            throw new common_1.BadRequestException(`You cannot ${action} your own account`);
        }
    }
    sanitize(user) {
        return {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            phone: user.phone,
            emailVerified: user.emailVerified,
            twoFactorEnabled: user.twoFactorEnabled,
            lastLoginAt: user.lastLoginAt,
            createdAt: user.createdAt,
            isActive: !user.deletedAt,
            suspendedAt: user.deletedAt ?? null,
            permissions: user.permissions ?? [],
        };
    }
};
exports.StaffService = StaffService;
exports.StaffService = StaffService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        auth_service_1.AuthService,
        typeorm_2.DataSource])
], StaffService);
//# sourceMappingURL=staff.service.js.map