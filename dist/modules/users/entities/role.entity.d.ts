import { BaseEntity } from '../../../shared/entities/base.entity';
export declare enum Permission {
    USERS_READ = "users:read",
    USERS_CREATE = "users:create",
    USERS_UPDATE = "users:update",
    USERS_DELETE = "users:delete",
    PRODUCTS_READ = "products:read",
    PRODUCTS_CREATE = "products:create",
    PRODUCTS_UPDATE = "products:update",
    PRODUCTS_DELETE = "products:delete",
    CATEGORIES_READ = "categories:read",
    CATEGORIES_CREATE = "categories:create",
    CATEGORIES_UPDATE = "categories:update",
    CATEGORIES_DELETE = "categories:delete",
    ORDERS_READ = "orders:read",
    ORDERS_CREATE = "orders:create",
    ORDERS_UPDATE = "orders:update",
    ORDERS_CANCEL = "orders:cancel",
    ORDERS_REFUND = "orders:refund",
    INVENTORY_READ = "inventory:read",
    INVENTORY_ADJUST = "inventory:adjust",
    INVENTORY_TRANSFER = "inventory:transfer",
    PAYMENTS_READ = "payments:read",
    PAYMENTS_REFUND = "payments:refund",
    REFUNDS_VIEW = "refunds:view",
    REFUNDS_PROCESS = "refunds:process",
    POS_REFUND_CASH = "pos:refund_cash",
    COUPONS_READ = "coupons:read",
    COUPONS_CREATE = "coupons:create",
    COUPONS_UPDATE = "coupons:update",
    COUPONS_DELETE = "coupons:delete",
    CUSTOMERS_READ = "customers:read",
    CUSTOMERS_UPDATE = "customers:update",
    ANALYTICS_VIEW = "analytics:view",
    REPORTS_EXPORT = "reports:export",
    AUDIT_READ = "audit:read",
    SETTINGS_READ = "settings:read",
    SETTINGS_UPDATE = "settings:update",
    POS_SELL = "pos:sell",
    POS_MANAGE_SHIFTS = "pos:manage_shifts",
    POS_VOID = "pos:void",
    STAFF_READ = "staff:read",
    STAFF_CREATE = "staff:create",
    STAFF_UPDATE = "staff:update",
    STAFF_DELETE = "staff:delete",
    BRANCHES_MANAGE = "branches:manage",
    AGENTS_VIEW = "agents:view",
    AGENTS_APPROVE = "agents:approve",
    AGENTS_PAYOUT = "agents:payout",
    AGENTS_COMMISSION_SET = "agents:commission_set",
    AGENT_SELF = "agent:self",
    ACCOUNTING_VIEW = "accounting:view",
    ACCOUNTING_MANAGE = "accounting:manage"
}
export declare class Role extends BaseEntity {
    name: string;
    description?: string;
    permissions: Permission[];
    isSystem: boolean;
}
export declare const SYSTEM_ROLES: Array<{
    name: string;
    description: string;
    permissions: Permission[];
}>;
