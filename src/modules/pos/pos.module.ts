import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PosSyncController } from './pos-sync.controller';
import { PosPagesController } from './pos-pages.controller';
import { PosSyncService } from './pos-sync.service';
import { PosSyncWorkerService } from './pos-sync-worker.service';
import { PosSyncJob } from './entities/pos-sync-job.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { Order, OrderItem, OrderStatusHistory } from '../orders/entities/order.entity';
import { ProductVariant, Product } from '../products/entities/product.entity';
import { Coupon } from '../coupons/entities/coupon.entity';
import { Customer, CustomerAddress } from '../customers/entities/customer.entity';
import { CustomersService } from '../customers/customers.service';
import { StockLevel } from '../inventory/entities/inventory.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PosSyncJob,
      Order, OrderItem, OrderStatusHistory,
      ProductVariant, Product,
      Coupon,
      Customer, CustomerAddress,
      StockLevel,
    ]),
    InventoryModule,
  ],
  controllers: [PosSyncController, PosPagesController],
  providers: [PosSyncService, PosSyncWorkerService, CustomersService],
  exports: [PosSyncService],
})
export class PosModule {}
