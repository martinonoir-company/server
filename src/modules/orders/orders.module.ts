import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, OrderItem, OrderStatusHistory } from './entities/order.entity';
import { Product, ProductVariant } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PricingEngine } from './pricing.engine';
import { InventoryModule } from '../inventory/inventory.module';
import { CouponsModule } from '../coupons/coupons.module';
import { ShippingModule } from '../shipping/shipping.module';
import { CartModule } from '../cart/cart.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, OrderStatusHistory, Product, ProductVariant, User]),
    InventoryModule,
    CouponsModule,
    ShippingModule,
    CartModule,
    SettingsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, PricingEngine],
  exports: [OrdersService, PricingEngine],
})
export class OrdersModule {}
