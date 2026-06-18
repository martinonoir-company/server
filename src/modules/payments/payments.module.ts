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

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order, Terminal]),
    // The Paystack webhook forwards refund/transfer events to
    // RefundsService and AgentsService (agent payouts are Paystack
    // transfers, settled by transfer.success/failed).
    forwardRef(() => RefundsModule),
    forwardRef(() => AgentsModule),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, MoniepointProvider, PaystackProvider, StripeProvider],
  exports: [PaymentsService, PaystackProvider],
})
export class PaymentsModule {}
