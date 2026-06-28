import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { MoniepointProvider } from './providers/moniepoint.provider';
import { PaystackProvider } from './providers/paystack.provider';
import { StripeProvider } from './providers/stripe.provider';
import { Payment } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { Terminal } from '../branches/entities/terminal.entity';
import { RefundsModule } from '../refunds/refunds.module';
import { AgentsModule } from '../agents/agents.module';
import { ShippingModule } from '../shipping/shipping.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order, Terminal]),
    // The Paystack webhook forwards refund/transfer events to
    // RefundsService and AgentsService (agent payouts are Paystack
    // transfers, settled by transfer.success/failed).
    forwardRef(() => RefundsModule),
    forwardRef(() => AgentsModule),
    // ShippingModule exposes ShippingDispatchService so the order-PAID
    // hook can fire AAJ booking + processing.
    ShippingModule,
    // RealtimeModule exposes PosGateway so the order-PAID hook can push a
    // dispatch alert to POS terminals over websocket.
    RealtimeModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, MoniepointProvider, PaystackProvider, StripeProvider],
  exports: [PaymentsService, PaystackProvider],
})
export class PaymentsModule {}
