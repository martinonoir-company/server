import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockMovement, StockLevel } from './entities/inventory.entity';
import { ProductVariant } from '../products/entities/product.entity';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { InventoryCronService } from './inventory-cron.service';

@Module({
  imports: [TypeOrmModule.forFeature([StockMovement, StockLevel, ProductVariant])],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryCronService],
  exports: [InventoryService],
})
export class InventoryModule {}
