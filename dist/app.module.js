"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const throttler_1 = require("@nestjs/throttler");
const schedule_1 = require("@nestjs/schedule");
const app_controller_1 = require("./app.controller");
const jwt_auth_guard_1 = require("./shared/guards/jwt-auth.guard");
const roles_guard_1 = require("./shared/guards/roles.guard");
const auth_module_1 = require("./modules/auth/auth.module");
const users_module_1 = require("./modules/users/users.module");
const products_module_1 = require("./modules/products/products.module");
const inventory_module_1 = require("./modules/inventory/inventory.module");
const orders_module_1 = require("./modules/orders/orders.module");
const payments_module_1 = require("./modules/payments/payments.module");
const shipping_module_1 = require("./modules/shipping/shipping.module");
const customers_module_1 = require("./modules/customers/customers.module");
const coupons_module_1 = require("./modules/coupons/coupons.module");
const media_module_1 = require("./modules/media/media.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
const analytics_module_1 = require("./modules/analytics/analytics.module");
const audit_module_1 = require("./modules/audit/audit.module");
const pos_module_1 = require("./modules/pos/pos.module");
const wishlist_module_1 = require("./modules/wishlist/wishlist.module");
const shared_module_1 = require("./shared/shared.module");
const staff_module_1 = require("./modules/staff/staff.module");
const cart_module_1 = require("./modules/cart/cart.module");
const branches_module_1 = require("./modules/branches/branches.module");
const realtime_module_1 = require("./modules/realtime/realtime.module");
const pos_sessions_module_1 = require("./modules/pos-sessions/pos-sessions.module");
const refunds_module_1 = require("./modules/refunds/refunds.module");
const agents_module_1 = require("./modules/agents/agents.module");
const accounting_module_1 = require("./modules/accounting/accounting.module");
const settings_module_1 = require("./modules/settings/settings.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: ['.env', '../.env'],
            }),
            typeorm_1.TypeOrmModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    type: 'postgres',
                    host: config.get('DB_HOST') ?? 'localhost',
                    port: config.get('DB_PORT') ?? 5432,
                    username: config.get('DB_USER') ?? 'martinonoir',
                    password: config.get('DB_PASSWORD') ?? 'martinonoir_dev',
                    database: config.get('DB_NAME') ?? 'martinonoir',
                    autoLoadEntities: true,
                    synchronize: false,
                    migrations: [__dirname + '/database/migrations/*.{ts,js}'],
                    migrationsTableName: 'typeorm_migrations',
                    migrationsRun: true,
                    logging: config.get('NODE_ENV') !== 'production',
                }),
            }),
            throttler_1.ThrottlerModule.forRoot([{
                    ttl: 60000,
                    limit: 100,
                }]),
            schedule_1.ScheduleModule.forRoot(),
            shared_module_1.SharedModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            staff_module_1.StaffModule,
            products_module_1.ProductsModule,
            inventory_module_1.InventoryModule,
            orders_module_1.OrdersModule,
            payments_module_1.PaymentsModule,
            shipping_module_1.ShippingModule,
            customers_module_1.CustomersModule,
            coupons_module_1.CouponsModule,
            media_module_1.MediaModule,
            notifications_module_1.NotificationsModule,
            analytics_module_1.AnalyticsModule,
            audit_module_1.AuditModule,
            pos_module_1.PosModule,
            wishlist_module_1.WishlistModule,
            cart_module_1.CartModule,
            branches_module_1.BranchesModule,
            realtime_module_1.RealtimeModule,
            pos_sessions_module_1.PosSessionsModule,
            refunds_module_1.RefundsModule,
            agents_module_1.AgentsModule,
            accounting_module_1.AccountingModule,
            settings_module_1.SettingsModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [
            { provide: core_1.APP_GUARD, useClass: throttler_1.ThrottlerGuard },
            { provide: core_1.APP_GUARD, useClass: jwt_auth_guard_1.JwtAuthGuard },
            {
                provide: core_1.APP_GUARD,
                useClass: roles_guard_1.RolesGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map