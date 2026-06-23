import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { GigLogisticsService } from './gig-logistics.service';
import { AajProvider } from './aaj.provider';
import { ShippingDispatchService } from './shipping-dispatch.service';
import { Order } from '../orders/entities/order.entity';
import { Branch } from '../branches/entities/branch.entity';
import { User } from '../users/entities/user.entity';

/**
 * Shipping module.
 *
 * Pieces:
 *  - AajProvider           — pure HTTP client for AAJ Express
 *                            (quote / create / process / track).
 *  - ShippingService       — checkout-time rate calculator. Calls AAJ
 *                            when address data is present; falls back
 *                            to a zone-based estimate otherwise.
 *  - ShippingDispatchService — orchestrates the post-payment booking
 *                            (create + process), the retry worker,
 *                            and the customer-facing tracking lookup.
 *
 * The dispatch service is exported so OrdersController and the
 * post-PAID hook in PaymentsService can drive it.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Order, Branch, User])],
  controllers: [ShippingController],
  providers: [
    AajProvider,
    ShippingService,
    GigLogisticsService,
    ShippingDispatchService,
  ],
  exports: [
    AajProvider,
    ShippingService,
    GigLogisticsService,
    ShippingDispatchService,
  ],
})
export class ShippingModule {}
