import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import {
  RefundRequest,
  RefundRequestItem,
} from './entities/refund-request.entity';
import { Order, OrderItem } from '../orders/entities/order.entity';
import { Payment } from '../payments/entities/payment.entity';
import { StockMovement } from '../inventory/entities/inventory.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentsModule } from '../payments/payments.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RefundRequest,
      RefundRequestItem,
      Order,
      OrderItem,
      Payment,
      StockMovement,
    ]),
    InventoryModule,
    // PaymentsModule re-exports PaystackProvider; refunds also needs to
    // be optionally injectable INTO PaymentsController (for webhook
    // settlement), so use forwardRef on both sides. AgentsModule is
    // forwardRef'd because the refund flow tells AgentsService to
    // reverse the agent commission on an order-refund.
    forwardRef(() => PaymentsModule),
    forwardRef(() => AgentsModule),
  ],
  controllers: [RefundsController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
