/**
 * Payment Provider Interface
 * All payment providers (Moniepoint, Paystack, Stripe) implement this contract.
 */
export interface PaymentIntent {
  /** Provider-specific reference ID */
  providerReference: string;
  /** Amount in minor units */
  amount: number;
  currency: string;
  /** Provider name */
  provider: PaymentProviderName;
  /** Status from the provider */
  status: PaymentIntentStatus;
  /** Checkout/redirect URL (for hosted payment pages) */
  checkoutUrl?: string;
  /** Raw provider response for debugging */
  metadata?: Record<string, unknown>;
}

export enum PaymentProviderName {
  MONIEPOINT = 'MONIEPOINT',
  PAYSTACK = 'PAYSTACK',
  STRIPE = 'STRIPE',
}

export enum PaymentIntentStatus {
  PENDING = 'PENDING',
  REQUIRES_ACTION = 'REQUIRES_ACTION',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface CreatePaymentInput {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  callbackUrl: string;
  metadata?: Record<string, string>;
}

export interface VerifyPaymentInput {
  providerReference: string;
  provider: PaymentProviderName;
}

export interface RefundInput {
  providerReference: string;
  amount: number;
  reason?: string;
}

export interface RefundResult {
  providerReference: string;
  refundReference: string;
  amount: number;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
}

export interface WebhookPayload {
  provider: PaymentProviderName;
  rawBody: Buffer;
  signature: string;
  headers: Record<string, string>;
}

/**
 * All payment providers must implement this interface.
 */
export interface IPaymentProvider {
  readonly name: PaymentProviderName;

  /** Create a payment intent / initialize a transaction */
  createPayment(input: CreatePaymentInput): Promise<PaymentIntent>;

  /** Verify a payment status */
  verifyPayment(input: VerifyPaymentInput): Promise<PaymentIntent>;

  /** Process a refund */
  refund(input: RefundInput): Promise<RefundResult>;

  /** Verify webhook signature */
  verifyWebhookSignature(payload: WebhookPayload): boolean;
}
