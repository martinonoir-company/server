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
 * Moniepoint payment provider (NG primary).
 * Set MONIEPOINT_API_KEY and MONIEPOINT_SECRET_KEY in env.
 * Without them, operates in stub mode.
 */
@Injectable()
export class MoniepointProvider implements IPaymentProvider {
  readonly name = PaymentProviderName.MONIEPOINT;
  private readonly logger = new Logger(MoniepointProvider.name);
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly isLive: boolean;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = process.env['MONIEPOINT_API_KEY'] ?? '';
    this.secretKey = process.env['MONIEPOINT_SECRET_KEY'] ?? '';
    this.isLive = !!(this.apiKey && this.secretKey);
    this.baseUrl = process.env['MONIEPOINT_BASE_URL'] ?? 'https://api.moniepoint.com/api/v1';
    if (!this.isLive) {
      this.logger.warn('MONIEPOINT_API_KEY not set — running in stub mode');
    }
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentIntent> {
    this.logger.log(`Creating Moniepoint payment for order ${input.orderNumber}: ${input.amount} ${input.currency}`);

    if (!this.isLive) {
      const reference = `MNP-${generateUlid()}`;
      return {
        providerReference: reference,
        amount: input.amount,
        currency: input.currency,
        provider: this.name,
        status: PaymentIntentStatus.REQUIRES_ACTION,
        checkoutUrl: `https://checkout.moniepoint.com/stub/${reference}`,
        metadata: { orderId: input.orderId, orderNumber: input.orderNumber },
      };
    }

    // Live: Call Moniepoint payment initialization
    const reference = `MN-${input.orderNumber}-${Date.now()}`;
    const body = JSON.stringify({
      amount: input.amount / 100, // Moniepoint expects Naira, not kobo
      reference,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      description: `Martinonoir Order ${input.orderNumber}`,
      callbackUrl: input.callbackUrl,
      metadata: {
        orderId: input.orderId,
        orderNumber: input.orderNumber,
      },
    });

    try {
      const res = await fetch(`${this.baseUrl}/merchant/transactions/init-transaction`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      const data = await res.json();

      if (!data.responseBody?.checkoutUrl) {
        this.logger.error(`Moniepoint init failed: ${JSON.stringify(data)}`);
        return {
          providerReference: reference,
          amount: input.amount,
          currency: input.currency,
          provider: this.name,
          status: PaymentIntentStatus.FAILED,
          metadata: { error: data.responseMessage ?? 'Init failed' },
        };
      }

      return {
        providerReference: data.responseBody.transactionReference ?? reference,
        amount: input.amount,
        currency: input.currency,
        provider: this.name,
        status: PaymentIntentStatus.REQUIRES_ACTION,
        checkoutUrl: data.responseBody.checkoutUrl,
        metadata: data.responseBody,
      };
    } catch (err) {
      this.logger.error(`Moniepoint request failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      // Fallback — return stub response
      return {
        providerReference: reference,
        amount: input.amount,
        currency: input.currency,
        provider: this.name,
        status: PaymentIntentStatus.FAILED,
        metadata: { error: 'Connection failed' },
      };
    }
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<PaymentIntent> {
    this.logger.log(`Verifying Moniepoint payment ${input.providerReference}`);

    if (!this.isLive) {
      return {
        providerReference: input.providerReference,
        amount: 0,
        currency: 'NGN',
        provider: this.name,
        status: PaymentIntentStatus.SUCCEEDED,
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/merchant/transactions/${input.providerReference}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });

      const data = await res.json();
      const status = data.responseBody?.paymentStatus;
      const statusMap: Record<string, PaymentIntentStatus> = {
        PAID: PaymentIntentStatus.SUCCEEDED,
        FAILED: PaymentIntentStatus.FAILED,
        PENDING: PaymentIntentStatus.PENDING,
        EXPIRED: PaymentIntentStatus.CANCELLED,
      };

      return {
        providerReference: input.providerReference,
        amount: (data.responseBody?.amount ?? 0) * 100,
        currency: 'NGN',
        provider: this.name,
        status: statusMap[status] ?? PaymentIntentStatus.PENDING,
        metadata: data.responseBody,
      };
    } catch {
      return {
        providerReference: input.providerReference,
        amount: 0,
        currency: 'NGN',
        provider: this.name,
        status: PaymentIntentStatus.PENDING,
      };
    }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    this.logger.log(`Processing Moniepoint refund for ${input.providerReference}: ${input.amount}`);

    // Moniepoint refunds are typically initiated manually
    return {
      providerReference: input.providerReference,
      refundReference: `MNP-REF-${generateUlid()}`,
      amount: input.amount,
      status: 'PENDING',
    };
  }

  verifyWebhookSignature(payload: WebhookPayload): boolean {
    if (!this.isLive || !this.secretKey) {
      this.logger.log('[STUB] Moniepoint webhook signature verification bypassed');
      return true;
    }

    // Moniepoint uses HMAC-SHA512 with the secret key
    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(payload.rawBody)
      .digest('hex');

    return hash === payload.signature;
  }
}
