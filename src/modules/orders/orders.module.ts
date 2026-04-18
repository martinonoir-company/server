import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, OrderItem, OrderStatusHistory } from './entities/order.entity';
import { Product, ProductVariant } from '../products/entities/product.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PricingEngine } from './pricing.engine';
import { InventoryModule } from '../inventory/inventory.module';
import { CouponsModule } from '../coupons/coupons.module';
import { ShippingModule } from '../shipping/shipping.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, OrderStatusHistory, Product, ProductVariant]),
    InventoryModule,
    CouponsModule,
    ShippingModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, PricingEngine],
  exports: [OrdersService, PricingEngine],
})
export class OrdersModule {}
