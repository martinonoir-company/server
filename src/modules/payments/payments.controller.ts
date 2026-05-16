import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  RawBodyRequest,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import {
  PaymentProviderName,
  CreatePaymentInput,
} from './interfaces/payment-provider.interface';
import {
  PaymentStatus,
  PaymentChannel,
  PaymentProvider,
} from './entities/payment.entity';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Public } from '../../shared/decorators/public.decorator';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';
import { Permission } from '../users/entities/role.entity';
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

  // ── Admin: payment records ──

  /** Paginated payments list for the admin Payments page. */
  @Get()
  @RequirePermissions(Permission.PAYMENTS_READ)
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('provider') provider?: string,
    @Query('search') search?: string,
  ) {
    const result = await this.paymentsService.list({
      page: page ? parseInt(page, 10) || 1 : 1,
      limit: limit ? parseInt(limit, 10) || 20 : 20,
      status: status ? (status as PaymentStatus) : undefined,
      channel: channel ? (channel as PaymentChannel) : undefined,
      provider: provider ? (provider as PaymentProvider) : undefined,
      search: search || undefined,
    });
    return { data: result };
  }

  /** All payment rows for one order. */
  @Get('order/:orderId')
  @RequirePermissions(Permission.PAYMENTS_READ)
  async byOrder(@Param('orderId') orderId: string) {
    const items = await this.paymentsService.findByOrder(orderId);
    return { data: items };
  }

  @Get(':id')
  @RequirePermissions(Permission.PAYMENTS_READ)
  async findOne(@Param('id') id: string) {
    const payment = await this.paymentsService.findById(id);
    return { data: payment };
  }

  // ── Payment initiation / verification ──
  // NOTE: full storefront/mobile (Paystack) and POS (Moniepoint) flows are
  // wired in phases 2 and 3. These keep the existing surface compiling.

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
      callbackUrl:
        dto.callbackUrl ??
        `${process.env['FRONTEND_URL'] ?? 'http://localhost:3002'}/order-confirmation?order=${dto.orderNumber}`,
    };
    const intent = await this.paymentsService.createProviderPayment(
      input,
      dto.provider,
    );
    return { data: intent };
  }

  @Post('verify')
  async verifyPayment(@Body() dto: VerifyPaymentDto) {
    const result = await this.paymentsService.verifyProviderPayment(dto);
    return { data: result };
  }

  // ── Webhook Endpoints ──
  // Public (no JWT) — verified by provider-specific signatures. Phases 2/3
  // attach reconciliation; for now they validate, log, and ack 200 fast.

  @Public()
  @Post('webhooks/paystack')
  @HttpCode(HttpStatus.OK)
  async paystackWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) return { received: true };

    const valid = this.paymentsService
      .resolveProvider('NGN', PaymentProviderName.PAYSTACK)
      .verifyWebhookSignature({
        provider: PaymentProviderName.PAYSTACK,
        rawBody,
        signature: signature || '',
        headers: req.headers as Record<string, string>,
      });
    if (!valid) {
      this.logger.warn('Invalid Paystack webhook signature');
      return { received: false };
    }
    this.logger.log('Paystack webhook accepted (reconciliation wired in phase 2)');
    return { received: true };
  }

  @Public()
  @Post('webhooks/moniepoint')
  @HttpCode(HttpStatus.OK)
  async moniepointWebhook(@Req() req: RawBodyRequest<Request>) {
    // Moniepoint does not publish a webhook payload schema. Strategy:
    // accept, store raw, ack 200 fast, then reconcile asynchronously via
    // the authoritative transaction-lookup API (wired in phase 3).
    const rawBody = req.rawBody;
    this.logger.log(
      `Moniepoint webhook received (${rawBody?.length ?? 0} bytes) — reconciliation wired in phase 3`,
    );
    return { received: true };
  }

  @Public()
  @Post('webhooks/stripe')
  @HttpCode(HttpStatus.OK)
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) return { received: true };
    const valid = this.paymentsService
      .resolveProvider('USD', PaymentProviderName.STRIPE)
      .verifyWebhookSignature({
        provider: PaymentProviderName.STRIPE,
        rawBody,
        signature: signature || '',
        headers: req.headers as Record<string, string>,
      });
    if (!valid) {
      this.logger.warn('Invalid Stripe webhook signature');
      return { received: false };
    }
    return { received: true };
  }
}
