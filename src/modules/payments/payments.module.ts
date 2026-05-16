import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { MoniepointProvider } from './providers/moniepoint.provider';
import { PaystackProvider } from './providers/paystack.provider';
import { StripeProvider } from './providers/stripe.provider';
import { Payment } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { Terminal } from '../branches/entities/terminal.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Order, Terminal])],
  controllers: [PaymentsController],
  providers: [PaymentsService, MoniepointProvider, PaystackProvider, StripeProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
