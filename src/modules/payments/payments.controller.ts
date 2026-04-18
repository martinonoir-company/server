import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  Res,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  RawBodyRequest,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PaymentsService } from './payments.service';
import {
  PaymentProviderName,
  PaymentIntentStatus,
  CreatePaymentInput,
} from './interfaces/payment-provider.interface';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Public } from '../../shared/decorators/public.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';

// ── DTOs ──

export class InitiatePaymentDto {
  @IsString() orderId!: string;
  @IsString() orderNumber!: string;
  @IsNumber() amount!: number;
  @IsString() currency!: string;
  @IsString() customerEmail!: string;
  @IsString() customerName!: string;
  @IsOptional() @IsString() callbackUrl?: string;
  @IsOptional() @IsEnum(PaymentProviderName) provider?: PaymentProviderName;
}

export class VerifyPaymentDto {
  @IsString() providerReference!: string;
  @IsEnum(PaymentProviderName) provider!: PaymentProviderName;
}

@Controller({ path: 'payments', version: '1' })
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Initialize a payment for an order.
   * Returns a checkout URL or client secret for the frontend.
   */
  @Post('initiate')
  async initiatePayment(
    @Body() dto: InitiatePaymentDto,
    @CurrentUser() user?: User,
  ) {
    const input: CreatePaymentInput = {
      orderId: dto.orderId,
      orderNumber: dto.orderNumber,
      amount: dto.amount,
      currency: dto.currency,
      customerEmail: dto.customerEmail || user?.email || '',
      customerName: dto.customerName || user?.fullName || '',
      callbackUrl: dto.callbackUrl ?? `${process.env['FRONTEND_URL'] ?? 'http://localhost:3002'}/order-confirmation?order=${dto.orderNumber}`,
    };

    const intent = await this.paymentsService.createPayment(input, dto.provider);
    return { data: intent };
  }

  /**
   * Verify payment status by provider reference.
   */
  @Post('verify')
  async verifyPayment(@Body() dto: VerifyPaymentDto) {
    const result = await this.paymentsService.verifyPayment(dto);
    return { data: result };
  }

  /**
   * Get payment status for an order.
   */
  @Get('status/:orderId')
  async getPaymentStatus(@Param('orderId') orderId: string) {
    // For now return a mock - this would query a payments table
    return {
      data: {
        orderId,
        status: PaymentIntentStatus.PENDING,
        provider: null,
        providerReference: null,
      },
    };
  }

  // ── Webhook Endpoints ──
  // These are public (no JWT) — verified by provider-specific signatures

  /**
   * Paystack webhook — verifies HMAC-SHA512 signature
   */
  @Public()
  @Post('webhooks/paystack')
  @HttpCode(HttpStatus.OK)
  async paystackWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
  ) {
    this.logger.log('Received Paystack webhook');

    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.warn('No raw body on Paystack webhook');
      return { received: true };
    }

    const isValid = this.paymentsService.resolveProvider('NGN', PaymentProviderName.PAYSTACK)
      .verifyWebhookSignature({
        provider: PaymentProviderName.PAYSTACK,
        rawBody,
        signature: signature || '',
        headers: req.headers as Record<string, string>,
      });

    if (!isValid) {
      this.logger.warn('Invalid Paystack webhook signature');
      return { received: false, error: 'Invalid signature' };
    }

    const event = JSON.parse(rawBody.toString());
    this.logger.log(`Paystack event: ${event.event}`);

    // Process event
    if (event.event === 'charge.success') {
      const reference = event.data?.reference;
      if (reference) {
        this.logger.log(`Payment succeeded: ${reference}`);
        // TODO: Update order status to PAID
      }
    }

    return { received: true };
  }

  /**
   * Stripe webhook — verifies stripe-signature header
   */
  @Public()
  @Post('webhooks/stripe')
  @HttpCode(HttpStatus.OK)
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    this.logger.log('Received Stripe webhook');

    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.warn('No raw body on Stripe webhook');
      return { received: true };
    }

    const isValid = this.paymentsService.resolveProvider('USD', PaymentProviderName.STRIPE)
      .verifyWebhookSignature({
        provider: PaymentProviderName.STRIPE,
        rawBody,
        signature: signature || '',
        headers: req.headers as Record<string, string>,
      });

    if (!isValid) {
      this.logger.warn('Invalid Stripe webhook signature');
      return { received: false, error: 'Invalid signature' };
    }

    const event = JSON.parse(rawBody.toString());
    this.logger.log(`Stripe event: ${event.type}`);

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntentId = event.data?.object?.id;
      if (paymentIntentId) {
        this.logger.log(`Stripe payment succeeded: ${paymentIntentId}`);
        // TODO: Update order status to PAID
      }
    }

    return { received: true };
  }

  /**
   * Moniepoint webhook
   */
  @Public()
  @Post('webhooks/moniepoint')
  @HttpCode(HttpStatus.OK)
  async moniepointWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-moniepoint-signature') signature: string,
  ) {
    this.logger.log('Received Moniepoint webhook');

    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.warn('No raw body on Moniepoint webhook');
      return { received: true };
    }

    const isValid = this.paymentsService.resolveProvider('NGN', PaymentProviderName.MONIEPOINT)
      .verifyWebhookSignature({
        provider: PaymentProviderName.MONIEPOINT,
        rawBody,
        signature: signature || '',
        headers: req.headers as Record<string, string>,
      });

    if (!isValid) {
      this.logger.warn('Invalid Moniepoint webhook signature');
      return { received: false, error: 'Invalid signature' };
    }

    const event = JSON.parse(rawBody.toString());
    this.logger.log(`Moniepoint event: ${JSON.stringify(event.eventType || event.event)}`);

    return { received: true };
  }
}
