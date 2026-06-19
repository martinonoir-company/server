import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';

// ── Security Guards ──
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
import { RolesGuard } from './shared/guards/roles.guard';

// ── Bounded Context Modules ──
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { CustomersModule } from './modules/customers/customers.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { MediaModule } from './modules/media/media.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { PosModule } from './modules/pos/pos.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { SharedModule } from './shared/shared.module';
import { StaffModule } from './modules/staff/staff.module';
import { CartModule } from './modules/cart/cart.module';
import { BranchesModule } from './modules/branches/branches.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { PosSessionsModule } from './modules/pos-sessions/pos-sessions.module';
import { RefundsModule } from './modules/refunds/refunds.module';
import { AgentsModule } from './modules/agents/agents.module';
import { AccountingModule } from './modules/accounting/accounting.module';

@Module({
  imports: [
    // ── Config ──
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),

    // ── Database ──
    // Schema is managed by TypeORM migrations (see `src/database/migrations`).
    // `synchronize` is OFF everywhere; `migrationsRun: true` applies any
    // pending migrations on boot so dev/CI stays in sync without a manual step.
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST') ?? 'localhost',
        port: config.get<number>('DB_PORT') ?? 5432,
        username: config.get<string>('DB_USER') ?? 'martinonoir',
        password: config.get<string>('DB_PASSWORD') ?? 'martinonoir_dev',
        database: config.get<string>('DB_NAME') ?? 'martinonoir',
        autoLoadEntities: true,
        synchronize: false,
        migrations: [__dirname + '/database/migrations/*.{ts,js}'],
        migrationsTableName: 'typeorm_migrations',
        migrationsRun: true,
        logging: config.get<string>('NODE_ENV') !== 'production',
      }),
    }),

    // ── Rate Limiting — Global (100 req/min) + per-route overrides ──
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),

    // ── Scheduled Tasks ──
    ScheduleModule.forRoot(),

    // ── Bounded Contexts ──
    SharedModule,
    AuthModule,
    UsersModule,
    StaffModule,
    ProductsModule,
    InventoryModule,
    OrdersModule,
    PaymentsModule,
    ShippingModule,
    CustomersModule,
    CouponsModule,
    MediaModule,
    NotificationsModule,
    AnalyticsModule,
    AuditModule,
    PosModule,
    WishlistModule,
    CartModule,
    BranchesModule,
    RealtimeModule,
    PosSessionsModule,
    RefundsModule,
    AgentsModule,
    AccountingModule,
  ],
  controllers: [AppController],
  providers: [
    // ── Global Guards (applied to all routes) ──
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
