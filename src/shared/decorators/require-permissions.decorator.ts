import { SetMetadata } from '@nestjs/common';
import { Permission } from '../../modules/users/entities/role.entity';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to require specific permissions on a route.
 * Used with RolesGuard to enforce RBAC.
 *
 * @example
 * @RequirePermissions(Permission.PRODUCTS_CREATE, Permission.PRODUCTS_UPDATE)
 * @Post('products')
 * createProduct() { ... }
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
