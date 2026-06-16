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
 * Paystack payment provider (NG secondary).
 * Uses Paystack's Initialize Transaction → Verify flow.
 * Set PAYSTACK_SECRET_KEY in env to enable live transactions.
 * Without it, operates in stub mode.
 */
@Injectable()
export class PaystackProvider implements IPaymentProvider {
  readonly name = PaymentProviderName.PAYSTACK;
  private readonly logger = new Logger(PaystackProvider.name);
  private readonly secretKey: string;
  private readonly isLive: boolean;

  constructor() {
    this.secretKey = process.env['PAYSTACK_SECRET_KEY'] ?? '';
    this.isLive = !!this.secretKey;
    if (!this.isLive) {
      this.logger.warn('PAYSTACK_SECRET_KEY not set — running in stub mode');
    }
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentIntent> {
    this.logger.log(`Creating Paystack payment for order ${input.orderNumber}: ${input.amount} ${input.currency}`);

    if (!this.isLive) {
      // Stub mode mirrors live: echo back the caller's reference so the
      // verify-by-reference path works end-to-end without real keys.
      const reference =
        input.metadata?.['merchantReference'] ?? `PSK-${generateUlid()}`;
      return {
        providerReference: reference,
        amount: input.amount,
        currency: input.currency,
        provider: this.name,
        status: PaymentIntentStatus.REQUIRES_ACTION,
        checkoutUrl: `https://checkout.paystack.com/stub/${reference}`,
        metadata: { orderId: input.orderId, orderNumber: input.orderNumber },
      };
    }

    // Live: Call Paystack Initialize Transaction.
    // The caller passes our own merchantReference — Paystack uses it as the
    // transaction `reference`, so we can later verify by that same value.
    const reference =
      input.metadata?.['merchantReference'] ??
      `MN-${input.orderNumber}-${Date.now()}`;
    const body = JSON.stringify({
      email: input.customerEmail,
      amount: input.amount, // Paystack expects amount in kobo
      currency: input.currency,
      reference,
      callback_url: input.callbackUrl,
      metadata: {
        orderId: input.orderId,
        orderNumber: input.orderNumber,
        customerName: input.customerName,
      },
    });

    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    const data = await res.json();

    if (!data.status) {
      this.logger.error(`Paystack init failed: ${data.message}`);
      return {
        providerReference: '',
        amount: input.amount,
        currency: input.currency,
        provider: this.name,
        status: PaymentIntentStatus.FAILED,
        metadata: { error: data.message },
      };
    }

    return {
      providerReference: data.data.reference,
      amount: input.amount,
      currency: input.currency,
      provider: this.name,
      status: PaymentIntentStatus.REQUIRES_ACTION,
      checkoutUrl: data.data.authorization_url,
      metadata: { accessCode: data.data.access_code },
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<PaymentIntent> {
    this.logger.log(`Verifying Paystack payment ${input.providerReference}`);

    if (!this.isLive) {
      return {
        providerReference: input.providerReference,
        amount: 0,
        currency: 'NGN',
        provider: this.name,
        status: PaymentIntentStatus.SUCCEEDED,
      };
    }

    const res = await fetch(`https://api.paystack.co/transaction/verify/${input.providerReference}`, {
      headers: { 'Authorization': `Bearer ${this.secretKey}` },
    });

    const data = await res.json();

    const statusMap: Record<string, PaymentIntentStatus> = {
      success: PaymentIntentStatus.SUCCEEDED,
      failed: PaymentIntentStatus.FAILED,
      abandoned: PaymentIntentStatus.CANCELLED,
    };

    return {
      providerReference: input.providerReference,
      amount: data.data?.amount ?? 0,
      currency: data.data?.currency ?? 'NGN',
      provider: this.name,
      status: statusMap[data.data?.status] ?? PaymentIntentStatus.PENDING,
      metadata: { gatewayResponse: data.data?.gateway_response },
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    this.logger.log(`Processing Paystack refund for ${input.providerReference}: ${input.amount}`);

    if (!this.isLive) {
      return {
        providerReference: input.providerReference,
        refundReference: `PSK-REF-${generateUlid()}`,
        amount: input.amount,
        status: 'PENDING',
      };
    }

    const res = await fetch('https://api.paystack.co/refund', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction: input.providerReference,
        amount: input.amount,
      }),
    });

    const data = await res.json();

    return {
      providerReference: input.providerReference,
      refundReference: data.data?.id?.toString() ?? `PSK-REF-${generateUlid()}`,
      amount: input.amount,
      status: data.status ? 'PENDING' : 'FAILED',
    };
  }

  // ── Bank verification + transfer (used by the refund flow) ──

  /**
   * Resolve a Nigerian bank account number against Paystack. Confirms the
   * account exists at the chosen bank and returns the account holder's
   * name — the POS uses this to make the cashier confirm the name with
   * the customer before submitting a refund request, which is the only
   * defence against typos in the account number.
   */
  async resolveBankAccount(input: {
    accountNumber: string;
    bankCode: string;
  }): Promise<{ accountName: string } | { error: string }> {
    if (!this.isLive) {
      // Stub mirrors the success shape so the UI path can be exercised
      // without contacting Paystack.
      return { accountName: `STUB ACCOUNT ${input.accountNumber.slice(-4)}` };
    }
    const url = new URL('https://api.paystack.co/bank/resolve');
    url.searchParams.set('account_number', input.accountNumber);
    url.searchParams.set('bank_code', input.bankCode);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.secretKey}` },
    });
    const data = (await res.json().catch(() => ({}))) as {
      status?: boolean;
      message?: string;
      data?: { account_name?: string };
    };
    if (!data.status || !data.data?.account_name) {
      return { error: data.message ?? 'Could not verify account' };
    }
    return { accountName: data.data.account_name };
  }

  /** List of Paystack-supported Nigerian banks (code + name). */
  async listBanks(): Promise<Array<{ name: string; code: string }>> {
    if (!this.isLive) {
      return [
        { name: 'Access Bank', code: '044' },
        { name: 'GTBank', code: '058' },
        { name: 'Zenith Bank', code: '057' },
        { name: 'UBA', code: '033' },
        { name: 'First Bank', code: '011' },
      ];
    }
    const res = await fetch(
      'https://api.paystack.co/bank?country=nigeria&currency=NGN',
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    );
    const data = (await res.json().catch(() => ({}))) as {
      status?: boolean;
      data?: Array<{ name: string; code: string }>;
    };
    return data.data ?? [];
  }

  /**
   * Create or fetch a Paystack transfer recipient for this bank account.
   * The returned `recipient_code` is cached on the refund request so retries
   * don't create duplicate recipients.
   */
  async createTransferRecipient(input: {
    accountNumber: string;
    bankCode: string;
    accountName: string;
  }): Promise<{ recipientCode: string } | { error: string }> {
    if (!this.isLive) {
      return { recipientCode: `RCP_STUB_${generateUlid()}` };
    }
    const res = await fetch('https://api.paystack.co/transferrecipient', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'nuban',
        name: input.accountName,
        account_number: input.accountNumber,
        bank_code: input.bankCode,
        currency: 'NGN',
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      status?: boolean;
      message?: string;
      data?: { recipient_code?: string };
    };
    if (!data.status || !data.data?.recipient_code) {
      return { error: data.message ?? 'Could not create transfer recipient' };
    }
    return { recipientCode: data.data.recipient_code };
  }

  /**
   * Initiate a Paystack transfer to a previously created recipient. The
   * caller passes our own merchant reference so we can correlate the
   * webhook back to a refund row.
   */
  async initiateTransfer(input: {
    recipientCode: string;
    amount: number; // minor units (kobo)
    reason: string;
    reference: string;
  }): Promise<
    | { providerReference: string; status: 'PENDING' | 'SUCCEEDED' }
    | { error: string }
  > {
    if (!this.isLive) {
      return { providerReference: `TRF_STUB_${generateUlid()}`, status: 'PENDING' };
    }
    const res = await fetch('https://api.paystack.co/transfer', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: 'balance',
        amount: input.amount,
        recipient: input.recipientCode,
        reason: input.reason,
        reference: input.reference,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      status?: boolean;
      message?: string;
      data?: { transfer_code?: string; status?: string; reference?: string };
    };
    if (!data.status || !data.data?.transfer_code) {
      return { error: data.message ?? 'Transfer failed' };
    }
    return {
      providerReference: data.data.transfer_code,
      status: data.data.status === 'success' ? 'SUCCEEDED' : 'PENDING',
    };
  }

  verifyWebhookSignature(payload: WebhookPayload): boolean {
    if (!this.isLive) {
      this.logger.log('[STUB] Paystack webhook signature verification bypassed');
      return true;
    }

    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(payload.rawBody)
      .digest('hex');

    return hash === payload.signature;
  }
}
