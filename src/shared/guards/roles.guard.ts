import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { Permission } from '../../modules/users/entities/role.entity';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../modules/users/entities/role.entity';
import { UserRole } from '../../modules/users/entities/user.entity';

/**
 * RolesGuard — checks if the authenticated user's role has the required permissions.
 *
 * Flow:
 * 1. Skip if route is @Public()
 * 2. Skip if no @RequirePermissions() on the route (no RBAC enforcement needed)
 * 3. SUPER_ADMIN bypasses all permission checks
 * 4. Load user's role → check permissions against required set
 * 5. All required permissions must be present (AND logic)
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Skip public routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // 2. Get required permissions from decorator
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No permissions required → allow (only JWT auth needed)
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // 3. Get user from request (set by JwtAuthGuard)
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // 4. SUPER_ADMIN bypasses all checks
    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    // 5. Per-user permission override (set via staff permission management).
    //    An empty array is meaningful — it means "no grants" — so we key off
    //    Array.isArray rather than truthiness.
    let effectivePermissions: string[];
    if (Array.isArray(user.permissions)) {
      effectivePermissions = user.permissions;
    } else {
      const roleName = this.mapUserRoleToRoleName(user.role);
      const role = await this.roleRepo.findOne({ where: { name: roleName } });
      if (!role) {
        throw new ForbiddenException('Role not configured');
      }
      effectivePermissions = role.permissions;
    }

    // 6. Check ALL required permissions (AND logic)
    const hasAll = requiredPermissions.every((perm) =>
      effectivePermissions.includes(perm),
    );

    if (!hasAll) {
      const missing = requiredPermissions.filter(
        (p) => !effectivePermissions.includes(p),
      );
      throw new ForbiddenException(
        `Insufficient permissions. Missing: ${missing.join(', ')}`,
      );
    }

    return true;
  }

  private mapUserRoleToRoleName(userRole: UserRole): string {
    const mapping: Record<UserRole, string> = {
      [UserRole.SUPER_ADMIN]: 'SUPER_ADMIN',
      [UserRole.COMPANY_SUPER_ADMIN]: 'COMPANY_SUPER_ADMIN',
      [UserRole.COMPANY_STAFF]: 'COMPANY_STAFF',
      [UserRole.CUSTOMER]: 'CUSTOMER',
    };
    return mapping[userRole] ?? 'CUSTOMER';
  }
}
