import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { MoniepointProvider } from './providers/moniepoint.provider';
import { PaystackProvider } from './providers/paystack.provider';
import { StripeProvider } from './providers/stripe.provider';

@Module({
  imports: [],
  controllers: [PaymentsController],
  providers: [PaymentsService, MoniepointProvider, PaystackProvider, StripeProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}

