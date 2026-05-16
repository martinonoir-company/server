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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentsService } from './payments.service';
import { PaymentProviderName } from './interfaces/payment-provider.interface';
import {
  PaymentStatus,
  PaymentChannel,
  PaymentProvider,
} from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Public } from '../../shared/decorators/public.decorator';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';
import { Permission } from '../users/entities/role.entity';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { NotFoundException } from '@nestjs/common';

// ── DTOs ──

/**
 * Begin a payment for an already-created order. The client sends only the
 * order id; the server reads the authoritative amount/currency from the
 * order row — the client cannot influence what is charged.
 */
export class InitiatePaymentDto {
  @IsString() orderId!: string;
  @IsEnum(PaymentChannel) channel!: PaymentChannel;
  /** Email to send the Paystack receipt to (guest checkout). */
  @IsOptional() @IsString() customerEmail?: string;
  @IsOptional() @IsString() customerName?: string;
  /** Where Paystack returns the customer after the hosted checkout. */
  @IsOptional() @IsString() callbackUrl?: string;
}

@Controller({ path: 'payments', version: '1' })
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

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

  // ── Payment initiation / verification (storefront + mobile, Paystack) ──

  /**
   * Begin a Paystack payment for an order.
   *
   * Server-mediated end to end: the server reads the order's authoritative
   * amount, creates the payment row, and calls Paystack itself. The client
   * receives only our hosted-checkout URL — it never sees a Paystack key
   * and never calls Paystack's API.
   */
  @Post('initiate')
  async initiatePayment(
    @Body() dto: InitiatePaymentDto,
    @CurrentUser() user?: User,
  ) {
    const order = await this.orderRepo.findOne({ where: { id: dto.orderId } });
    if (!order) throw new NotFoundException(`Order ${dto.orderId} not found`);

    const email =
      dto.customerEmail || user?.email || order.guestEmail || '';
    const name =
      dto.customerName ||
      user?.fullName ||
      (order.shippingAddress
        ? `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`
        : '');

    const callbackUrl =
      dto.callbackUrl ??
      `${process.env['FRONTEND_URL'] ?? 'http://localhost:3002'}/order-confirmation?order=${order.orderNumber}`;

    const payment = await this.paymentsService.initiatePaystackPayment({
      order,
      channel: dto.channel,
      customerEmail: email,
      customerName: name,
      callbackUrl,
    });

    // Hand the client only what it needs — never provider secrets.
    return {
      data: {
        paymentId: payment.id,
        merchantReference: payment.merchantReference,
        checkoutUrl: payment.checkoutUrl,
        status: payment.status,
        amount: Number(payment.amount),
        currency: payment.currency,
      },
    };
  }

  /**
   * Reconcile and return a payment's current status.
   *
   * Authenticated clients call this on return from the hosted checkout to
   * learn the outcome. It triggers a server-side verify against the
   * provider — the client itself never calls the provider.
   */
  @Post('reconcile/:merchantReference')
  async reconcile(@Param('merchantReference') merchantReference: string) {
    const payment = await this.paymentsService.verifyAndReconcile(
      merchantReference,
    );
    return {
      data: {
        paymentId: payment.id,
        merchantReference: payment.merchantReference,
        status: payment.status,
        amount: Number(payment.amount),
        currency: payment.currency,
        failureReason: payment.failureReason,
      },
    };
  }

  // ── Webhook Endpoints ──
  // Public (no JWT) — verified by provider-specific signatures. Phases 2/3
  // attach reconciliation; for now they validate, log, and ack 200 fast.

  /**
   * Paystack webhook.
   *
   * Strategy: verify the HMAC-SHA512 signature, then treat the body only
   * as a "go reconcile now" nudge. We never trust the webhook body for
   * payment state — we call Paystack verify ourselves and apply that.
   * Always acks 200 quickly; reconciliation failures are swallowed so
   * Paystack doesn't retry-storm us (the client poll + verify is the
   * backstop).
   */
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
      this.logger.warn('Invalid Paystack webhook signature — rejected');
      return { received: false };
    }

    // Parse only to find which payment to reconcile. The reference Paystack
    // echoes back is our merchantReference.
    try {
      const event = JSON.parse(rawBody.toString()) as {
        event?: string;
        data?: { reference?: string };
      };
      const reference = event.data?.reference;
      if (reference) {
        const payment =
          await this.paymentsService.findByMerchantReference(reference);
        if (payment) {
          await this.paymentsService.attachWebhook(
            payment.id,
            event as unknown as Record<string, unknown>,
          );
          // Authoritative confirmation — never trust the webhook body.
          await this.paymentsService.verifyAndReconcile(reference);
        } else {
          this.logger.warn(
            `Paystack webhook for unknown reference ${reference}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Paystack webhook reconciliation error: ${(err as Error).message}`,
      );
    }
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
