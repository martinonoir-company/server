import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { Permission } from '../users/entities/role.entity';
import { AuthService } from '../auth/auth.service';
import {
  CreateStaffDto,
  UpdateStaffRoleDto,
  UpdateStaffPermissionsDto,
  TogglePermissionDto,
  ListStaffQueryDto,
} from './dto/staff.dto';

/**
 * Centralises all company-staff management for the admin platform.
 *
 * Scope rules:
 *  - SUPER_ADMIN accounts are never targets of any write operation here.
 *  - CUSTOMER accounts never appear in any staff query.
 *  - Callers cannot perform write operations against their own account.
 */
@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly authService: AuthService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Reads ─────────────────────────────────────────────────────────

  async listStaff(query: ListStaffQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.userRepo
      .createQueryBuilder('user')
      .where('user.role != :customer', { customer: UserRole.CUSTOMER })
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
      qb.andWhere(
        '(user.firstName ILIKE :q OR user.lastName ILIKE :q OR user.email ILIKE :q)',
        { q },
      );
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

  async getStaff(id: string) {
    const user = await this.loadStaffOrThrow(id, { allowSuspended: true });
    return this.sanitize(user);
  }

  // ─── Create ────────────────────────────────────────────────────────

  async createStaff(dto: CreateStaffDto, inviter: User) {
    const inviterName = `${inviter.firstName} ${inviter.lastName}`;
    const user = await this.authService.createStaffAccount(
      {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        role: dto.role,
      },
      inviterName,
    );
    return this.sanitize(user);
  }

  // ─── Role + Permissions ────────────────────────────────────────────

  async updateRole(id: string, dto: UpdateStaffRoleDto, requestingUser: User) {
    const target = await this.loadStaffOrThrow(id, { allowSuspended: true });
    this.assertMutableTarget(target, requestingUser, 'change role');

    await this.userRepo.update(id, { role: dto.role });
    return this.sanitize({ ...target, role: dto.role });
  }

  /** Replace the entire per-user permission override list. */
  async replacePermissions(
    id: string,
    dto: UpdateStaffPermissionsDto,
    requestingUser: User,
  ) {
    const target = await this.loadStaffOrThrow(id, { allowSuspended: true });
    this.assertMutableTarget(target, requestingUser, 'update permissions');

    const unique = Array.from(new Set(dto.permissions));
    await this.userRepo.update(id, { permissions: unique });
    return this.sanitize({ ...target, permissions: unique });
  }

  /** Flip a single permission flag on or off. */
  async togglePermission(
    id: string,
    dto: TogglePermissionDto,
    requestingUser: User,
  ) {
    const target = await this.loadStaffOrThrow(id, { allowSuspended: true });
    this.assertMutableTarget(target, requestingUser, 'update permissions');

    const current = new Set(target.permissions ?? []);
    if (dto.granted) current.add(dto.permission);
    else current.delete(dto.permission);

    const next = Array.from(current);
    await this.userRepo.update(id, { permissions: next });
    return this.sanitize({ ...target, permissions: next });
  }

  /** Grant every permission currently defined in the Permission enum. */
  async enableAllPermissions(id: string, requestingUser: User) {
    const target = await this.loadStaffOrThrow(id, { allowSuspended: true });
    this.assertMutableTarget(target, requestingUser, 'update permissions');

    const all = Object.values(Permission) as Permission[];
    await this.userRepo.update(id, { permissions: all });
    return this.sanitize({ ...target, permissions: all });
  }

  /** Revoke all permissions — leaves the staff member with no RBAC grants. */
  async disableAllPermissions(id: string, requestingUser: User) {
    const target = await this.loadStaffOrThrow(id, { allowSuspended: true });
    this.assertMutableTarget(target, requestingUser, 'update permissions');

    await this.userRepo.update(id, { permissions: [] });
    return this.sanitize({ ...target, permissions: [] });
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────

  /** Suspend (soft-delete) an account + revoke all sessions. */
  async suspendStaff(id: string, requestingUser: User): Promise<void> {
    const target = await this.loadStaffOrThrow(id, { allowSuspended: false });
    this.assertMutableTarget(target, requestingUser, 'suspend');
    if (target.deletedAt) {
      throw new BadRequestException('Account is already suspended');
    }

    await this.userRepo.softDelete(id);
    await this.authService.logoutAll(id);
  }

  async reactivateStaff(id: string, requestingUser: User) {
    const target = await this.loadStaffOrThrow(id, { allowSuspended: true });
    this.assertMutableTarget(target, requestingUser, 'reactivate');
    if (!target.deletedAt) {
      throw new BadRequestException('Account is not suspended');
    }

    await this.userRepo.restore(id);
    return this.sanitize({ ...target, deletedAt: undefined });
  }

  /**
   * Permanently delete a staff account. Irreversible.
   *
   * A plain hard delete fails once a staff member has any operational history,
   * because several tables reference users(id):
   *   - user_branches (branch assignments) — NO ACTION, but safe to remove.
   *   - pos_sessions.openedByStaffId — NO ACTION and NOT NULL, and these are
   *     cash-reconciliation records that must survive for accounting.
   *   - orders / expenses / accounting_audit_log — already ON DELETE SET NULL,
   *     so they are preserved automatically.
   *   - cart/wishlist/tokens — ON DELETE CASCADE, removed automatically.
   *
   * So we do the safe thing in one transaction:
   *   1. revoke sessions and clear branch assignments (safe blockers);
   *   2. if the staff member has NO immutable references (POS sessions), hard
   *      delete the row — a true permanent delete;
   *   3. otherwise anonymize + soft-delete the row, which honours the
   *      "permanent removal" intent (account unusable, PII wiped, email freed
   *      for reuse) WITHOUT destroying the POS accounting history that points
   *      at it.
   */
  async deleteStaff(id: string, requestingUser: User): Promise<void> {
    const target = await this.loadStaffOrThrow(id, { allowSuspended: true });
    this.assertMutableTarget(target, requestingUser, 'delete');

    await this.authService.logoutAll(id);

    await this.dataSource.transaction(async (manager) => {
      // 1. Remove branch assignments — pure mapping rows, safe to delete.
      await manager.query('DELETE FROM user_branches WHERE "userId" = $1', [id]);

      // 2. Does the staff member have immutable operational history that
      //    references them and cannot be removed or nulled?
      const [{ count }] = (await manager.query(
        'SELECT COUNT(*)::int AS count FROM pos_sessions WHERE "openedByStaffId" = $1',
        [id],
      )) as Array<{ count: number }>;

      if (count === 0) {
        // Clean account — a real permanent delete. CASCADE + SET NULL FKs
        // handle the remaining child rows.
        await manager.delete(User, id);
        return;
      }

      // 3. Has POS history → preserve it. Anonymize the row and soft-delete,
      //    freeing the email so it can be reused. Mirrors customer account
      //    deletion. Clear per-user CASCADE-style rows explicitly so nothing
      //    dangles while the row itself survives (soft-deleted).
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
      await manager.update(
        User,
        { id },
        {
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
        },
      );
      await manager.softDelete(User, id);
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private async loadStaffOrThrow(
    id: string,
    opts: { allowSuspended: boolean },
  ): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id },
      withDeleted: opts.allowSuspended,
    });
    if (!user || user.role === UserRole.CUSTOMER) {
      throw new NotFoundException('Staff member not found');
    }
    return user;
  }

  /**
   * Guard against write operations that would target:
   *  - a SUPER_ADMIN (protected)
   *  - the requester themselves (self-modification lockout)
   */
  private assertMutableTarget(
    target: User,
    requestingUser: User,
    action: string,
  ): void {
    if (target.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(`Cannot ${action} a SUPER_ADMIN`);
    }
    if (target.id === requestingUser.id) {
      throw new BadRequestException(`You cannot ${action} your own account`);
    }
  }

  private sanitize(user: Partial<User>) {
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
}
