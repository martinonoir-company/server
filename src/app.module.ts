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

@Module({
  imports: [
    // ── Config ──
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),

    // ── Database ──
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
        synchronize: config.get<string>('NODE_ENV') !== 'production',
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
