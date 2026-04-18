import { Module } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { GigLogisticsService } from './gig-logistics.service';

@Module({
  controllers: [ShippingController],
  providers: [ShippingService, GigLogisticsService],
  exports: [ShippingService, GigLogisticsService],
})
export class ShippingModule {}
