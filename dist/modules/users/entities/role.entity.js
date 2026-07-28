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
exports.SYSTEM_ROLES = exports.Role = exports.Permission = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../shared/entities/base.entity");
var Permission;
(function (Permission) {
    Permission["USERS_READ"] = "users:read";
    Permission["USERS_CREATE"] = "users:create";
    Permission["USERS_UPDATE"] = "users:update";
    Permission["USERS_DELETE"] = "users:delete";
    Permission["PRODUCTS_READ"] = "products:read";
    Permission["PRODUCTS_CREATE"] = "products:create";
    Permission["PRODUCTS_UPDATE"] = "products:update";
    Permission["PRODUCTS_DELETE"] = "products:delete";
    Permission["CATEGORIES_READ"] = "categories:read";
    Permission["CATEGORIES_CREATE"] = "categories:create";
    Permission["CATEGORIES_UPDATE"] = "categories:update";
    Permission["CATEGORIES_DELETE"] = "categories:delete";
    Permission["ORDERS_READ"] = "orders:read";
    Permission["ORDERS_CREATE"] = "orders:create";
    Permission["ORDERS_UPDATE"] = "orders:update";
    Permission["ORDERS_CANCEL"] = "orders:cancel";
    Permission["ORDERS_REFUND"] = "orders:refund";
    Permission["INVENTORY_READ"] = "inventory:read";
    Permission["INVENTORY_ADJUST"] = "inventory:adjust";
    Permission["INVENTORY_TRANSFER"] = "inventory:transfer";
    Permission["PAYMENTS_READ"] = "payments:read";
    Permission["PAYMENTS_REFUND"] = "payments:refund";
    Permission["REFUNDS_VIEW"] = "refunds:view";
    Permission["REFUNDS_PROCESS"] = "refunds:process";
    Permission["POS_REFUND_CASH"] = "pos:refund_cash";
    Permission["COUPONS_READ"] = "coupons:read";
    Permission["COUPONS_CREATE"] = "coupons:create";
    Permission["COUPONS_UPDATE"] = "coupons:update";
    Permission["COUPONS_DELETE"] = "coupons:delete";
    Permission["CUSTOMERS_READ"] = "customers:read";
    Permission["CUSTOMERS_UPDATE"] = "customers:update";
    Permission["ANALYTICS_VIEW"] = "analytics:view";
    Permission["REPORTS_EXPORT"] = "reports:export";
    Permission["AUDIT_READ"] = "audit:read";
    Permission["SETTINGS_READ"] = "settings:read";
    Permission["SETTINGS_UPDATE"] = "settings:update";
    Permission["POS_SELL"] = "pos:sell";
    Permission["POS_MANAGE_SHIFTS"] = "pos:manage_shifts";
    Permission["POS_VOID"] = "pos:void";
    Permission["STAFF_READ"] = "staff:read";
    Permission["STAFF_CREATE"] = "staff:create";
    Permission["STAFF_UPDATE"] = "staff:update";
    Permission["STAFF_DELETE"] = "staff:delete";
    Permission["BRANCHES_MANAGE"] = "branches:manage";
    Permission["AGENTS_VIEW"] = "agents:view";
    Permission["AGENTS_APPROVE"] = "agents:approve";
    Permission["AGENTS_PAYOUT"] = "agents:payout";
    Permission["AGENTS_COMMISSION_SET"] = "agents:commission_set";
    Permission["AGENT_SELF"] = "agent:self";
    Permission["ACCOUNTING_VIEW"] = "accounting:view";
    Permission["ACCOUNTING_MANAGE"] = "accounting:manage";
})(Permission || (exports.Permission = Permission = {}));
let Role = class Role extends base_entity_1.BaseEntity {
};
exports.Role = Role;
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ type: 'varchar', length: 100 }),
    __metadata("design:type", String)
], Role.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 500, nullable: true }),
    __metadata("design:type", String)
], Role.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', default: [] }),
    __metadata("design:type", Array)
], Role.prototype, "permissions", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], Role.prototype, "isSystem", void 0);
exports.Role = Role = __decorate([
    (0, typeorm_1.Entity)('roles')
], Role);
exports.SYSTEM_ROLES = [
    {
        name: 'SUPER_ADMIN',
        description: 'Full system access — all resources, all actions',
        permissions: Object.values(Permission),
    },
    {
        name: 'COMPANY_SUPER_ADMIN',
        description: 'Company owner — all business operations',
        permissions: Object.values(Permission).filter((p) => !p.startsWith('settings:') || p === Permission.SETTINGS_READ),
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
//# sourceMappingURL=role.entity.js.map