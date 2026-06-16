import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, OrderItem } from '../orders/entities/order.entity';
import { Product, ProductVariant } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { StockLevel } from '../inventory/entities/inventory.entity';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { RefundsModule } from '../refunds/refunds.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Product, ProductVariant, User, StockLevel]),
    RefundsModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
