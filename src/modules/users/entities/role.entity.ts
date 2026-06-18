import { Entity, Column, Index, ManyToMany, JoinTable } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';

/**
 * System permissions — resource:action pairs.
 * Enforced by RolesGuard via @RequirePermissions() decorator.
 */
export enum Permission {
  // Users
  USERS_READ = 'users:read',
  USERS_CREATE = 'users:create',
  USERS_UPDATE = 'users:update',
  USERS_DELETE = 'users:delete',

  // Products
  PRODUCTS_READ = 'products:read',
  PRODUCTS_CREATE = 'products:create',
  PRODUCTS_UPDATE = 'products:update',
  PRODUCTS_DELETE = 'products:delete',

  // Categories
  CATEGORIES_READ = 'categories:read',
  CATEGORIES_CREATE = 'categories:create',
  CATEGORIES_UPDATE = 'categories:update',
  CATEGORIES_DELETE = 'categories:delete',

  // Orders
  ORDERS_READ = 'orders:read',
  ORDERS_CREATE = 'orders:create',
  ORDERS_UPDATE = 'orders:update',
  ORDERS_CANCEL = 'orders:cancel',
  ORDERS_REFUND = 'orders:refund',

  // Inventory
  INVENTORY_READ = 'inventory:read',
  INVENTORY_ADJUST = 'inventory:adjust',
  INVENTORY_TRANSFER = 'inventory:transfer',

  // Payments
  PAYMENTS_READ = 'payments:read',
  PAYMENTS_REFUND = 'payments:refund',

  // Refunds (super-admin workflow)
  REFUNDS_VIEW = 'refunds:view',
  REFUNDS_PROCESS = 'refunds:process',
  POS_REFUND_CASH = 'pos:refund_cash',

  // Coupons
  COUPONS_READ = 'coupons:read',
  COUPONS_CREATE = 'coupons:create',
  COUPONS_UPDATE = 'coupons:update',
  COUPONS_DELETE = 'coupons:delete',

  // Customers
  CUSTOMERS_READ = 'customers:read',
  CUSTOMERS_UPDATE = 'customers:update',

  // Analytics
  ANALYTICS_VIEW = 'analytics:view',
  REPORTS_EXPORT = 'reports:export',

  // Audit
  AUDIT_READ = 'audit:read',

  // Settings
  SETTINGS_READ = 'settings:read',
  SETTINGS_UPDATE = 'settings:update',

  // POS
  POS_SELL = 'pos:sell',
  POS_MANAGE_SHIFTS = 'pos:manage_shifts',
  POS_VOID = 'pos:void',

  // Staff
  STAFF_READ = 'staff:read',
  STAFF_CREATE = 'staff:create',
  STAFF_UPDATE = 'staff:update',
  STAFF_DELETE = 'staff:delete',

  // Branches
  BRANCHES_MANAGE = 'branches:manage',

  // Marketing agents (super-admin workflow + agent self-service)
  AGENTS_VIEW = 'agents:view',
  AGENTS_APPROVE = 'agents:approve',
  AGENTS_PAYOUT = 'agents:payout',
  AGENTS_COMMISSION_SET = 'agents:commission_set',
  /** Capability for the agent's own session — never given to staff roles. */
  AGENT_SELF = 'agent:self',
}

/**
 * Role entity — defines a named set of permissions.
 * Baseline roles: SUPER_ADMIN, COMPANY_SUPER_ADMIN, COMPANY_STAFF, CUSTOMER
 */
@Entity('roles')
export class Role extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string;

  /** Array of Permission enum values this role grants */
  @Column({ type: 'jsonb', default: [] })
  permissions!: Permission[];

  /** System roles cannot be deleted or have permissions removed */
  @Column({ type: 'boolean', default: false })
  isSystem!: boolean;
}

/** Default role seeds (used by seed script) */
export const SYSTEM_ROLES: Array<{ name: string; description: string; permissions: Permission[] }> = [
  {
    name: 'SUPER_ADMIN',
    description: 'Full system access — all resources, all actions',
    permissions: Object.values(Permission),
  },
  {
    name: 'COMPANY_SUPER_ADMIN',
    description: 'Company owner — all business operations',
    permissions: Object.values(Permission).filter(
      (p) => !p.startsWith('settings:') || p === Permission.SETTINGS_READ,
    ),
  },
  {
    name: 'COMPANY_STAFF',
    description: 'General staff — day-to-day operations',
    permissions: [
      Permission.PRODUCTS_READ,
      Permission.CATEGORIES_READ,
      Permission.ORDERS_READ,
      Permission.ORDERS_UPDATE,
      Permission.INVENTORY_READ,
      Permission.INVENTORY_ADJUST,
      Permission.CUSTOMERS_READ,
      Permission.POS_SELL,
      Permission.POS_REFUND_CASH,
      Permission.COUPONS_READ,
    ],
  },
  {
    name: 'WAREHOUSE_STAFF',
    description: 'Warehouse operations — inventory management',
    permissions: [
      Permission.PRODUCTS_READ,
      Permission.INVENTORY_READ,
      Permission.INVENTORY_ADJUST,
      Permission.INVENTORY_TRANSFER,
      Permission.ORDERS_READ,
    ],
  },
  {
    name: 'CUSTOMER',
    description: 'Registered customer — storefront access only',
    permissions: [],
  },
  {
    name: 'MARKETING_AGENT',
    description: 'Marketing agent — agent dashboard access only',
    permissions: [Permission.AGENT_SELF],
  },
];
