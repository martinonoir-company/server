import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  IPaymentProvider,
  PaymentProviderName,
  PaymentIntent,
  PaymentIntentStatus,
  CreatePaymentInput,
  VerifyPaymentInput,
  RefundInput,
  RefundResult,
  WebhookPayload,
} from '../interfaces/payment-provider.interface';
import { generateUlid } from '../../../shared/entities/base.entity';

/**
 * Stripe payment provider (international, non-NG users).
 * Uses Stripe Checkout Sessions for PCI compliance.
 * Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in env.
 * Without them, operates in stub mode.
 */
@Injectable()
export class StripeProvider implements IPaymentProvider {
  readonly name = PaymentProviderName.STRIPE;
  private readonly logger = new Logger(StripeProvider.name);
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly isLive: boolean;

  constructor() {
    this.secretKey = process.env['STRIPE_SECRET_KEY'] ?? '';
    this.webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';
    this.isLive = !!this.secretKey;
    if (!this.isLive) {
      this.logger.warn('STRIPE_SECRET_KEY not set — running in stub mode');
    }
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentIntent> {
    this.logger.log(`Creating Stripe payment for order ${input.orderNumber}: ${input.amount} ${input.currency}`);

    if (!this.isLive) {
      const reference = `STRIPE-${generateUlid()}`;
      return {
        providerReference: reference,
        amount: input.amount,
        currency: input.currency,
        provider: this.name,
        status: PaymentIntentStatus.REQUIRES_ACTION,
        checkoutUrl: `https://checkout.stripe.com/stub/${reference}`,
        metadata: { orderId: input.orderId, orderNumber: input.orderNumber },
      };
    }

    // Live: Create Stripe Checkout Session
    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('success_url', input.callbackUrl);
    params.set('cancel_url', `${process.env['FRONTEND_URL'] ?? 'http://localhost:3002'}/cart`);
    params.set('customer_email', input.customerEmail);
    params.set('line_items[0][price_data][currency]', input.currency.toLowerCase());
    params.set('line_items[0][price_data][product_data][name]', `Order ${input.orderNumber}`);
    params.set('line_items[0][price_data][unit_amount]', String(input.amount));
    params.set('line_items[0][quantity]', '1');
    params.set('metadata[orderId]', input.orderId);
    params.set('metadata[orderNumber]', input.orderNumber);

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();

    if (data.error) {
      this.logger.error(`Stripe session create failed: ${data.error.message}`);
      return {
        providerReference: '',
        amount: input.amount,
        currency: input.currency,
        provider: this.name,
        status: PaymentIntentStatus.FAILED,
        metadata: { error: data.error.message },
      };
    }

    return {
      providerReference: data.id,
      amount: input.amount,
      currency: input.currency,
      provider: this.name,
      status: PaymentIntentStatus.REQUIRES_ACTION,
      checkoutUrl: data.url,
      metadata: { sessionId: data.id },
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<PaymentIntent> {
    this.logger.log(`Verifying Stripe payment ${input.providerReference}`);

    if (!this.isLive) {
      return {
        providerReference: input.providerReference,
        amount: 0,
        currency: 'USD',
        provider: this.name,
        status: PaymentIntentStatus.SUCCEEDED,
      };
    }

    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${input.providerReference}`, {
      headers: { 'Authorization': `Bearer ${this.secretKey}` },
    });

    const data = await res.json();

    const statusMap: Record<string, PaymentIntentStatus> = {
      complete: PaymentIntentStatus.SUCCEEDED,
      expired: PaymentIntentStatus.CANCELLED,
      open: PaymentIntentStatus.PENDING,
    };

    return {
      providerReference: input.providerReference,
      amount: data.amount_total ?? 0,
      currency: (data.currency ?? 'usd').toUpperCase(),
      provider: this.name,
      status: statusMap[data.status] ?? PaymentIntentStatus.PENDING,
      metadata: { paymentStatus: data.payment_status },
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    this.logger.log(`Processing Stripe refund for ${input.providerReference}: ${input.amount}`);

    if (!this.isLive) {
      return {
        providerReference: input.providerReference,
        refundReference: `STRIPE-REF-${generateUlid()}`,
        amount: input.amount,
        status: 'PENDING',
      };
    }

    const params = new URLSearchParams();
    params.set('payment_intent', input.providerReference);
    params.set('amount', String(input.amount));
    if (input.reason) params.set('reason', 'requested_by_customer');

    const res = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();

    return {
      providerReference: input.providerReference,
      refundReference: data.id ?? `STRIPE-REF-${generateUlid()}`,
      amount: input.amount,
      status: data.status === 'succeeded' ? 'SUCCEEDED' : 'PENDING',
    };
  }

  verifyWebhookSignature(payload: WebhookPayload): boolean {
    if (!this.isLive || !this.webhookSecret) {
      this.logger.log('[STUB] Stripe webhook signature verification bypassed');
      return true;
    }

    // Stripe uses a timestamp + HMAC-SHA256 scheme
    const sigHeader = payload.signature;
    const parts = sigHeader.split(',');
    const timestampPart = parts.find(p => p.startsWith('t='));
    const sigPart = parts.find(p => p.startsWith('v1='));

    if (!timestampPart || !sigPart) return false;

    const timestamp = timestampPart.split('=')[1];
    const expectedSig = sigPart.split('=')[1];

    const signedPayload = `${timestamp}.${payload.rawBody.toString()}`;
    const computedSig = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedPayload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(computedSig),
      Buffer.from(expectedSig ?? ''),
    );
  }
}
