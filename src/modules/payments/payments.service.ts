import { Injectable, BadRequestException } from '@nestjs/common';
import { IPaymentProvider, PaymentProviderName, CreatePaymentInput, PaymentIntent, VerifyPaymentInput, RefundInput, RefundResult } from './interfaces/payment-provider.interface';
import { MoniepointProvider } from './providers/moniepoint.provider';
import { PaystackProvider } from './providers/paystack.provider';
import { StripeProvider } from './providers/stripe.provider';

/**
 * Routes payment requests to the correct provider based on:
 * - Currency (NGN → Moniepoint/Paystack, USD → Stripe)
 * - Explicit provider selection
 * - Country-based routing
 */
@Injectable()
export class PaymentsService {
  private readonly providers: Map<PaymentProviderName, IPaymentProvider>;

  constructor(
    private readonly moniepoint: MoniepointProvider,
    private readonly paystack: PaystackProvider,
    private readonly stripe: StripeProvider,
  ) {
    this.providers = new Map<PaymentProviderName, IPaymentProvider>([
      [PaymentProviderName.MONIEPOINT, moniepoint],
      [PaymentProviderName.PAYSTACK, paystack],
      [PaymentProviderName.STRIPE, stripe],
    ]);
  }

  /**
   * Auto-route to the best provider based on currency.
   * NGN → Moniepoint (primary), fallback → Paystack
   * USD → Stripe
   */
  resolveProvider(currency: string, preferred?: PaymentProviderName): IPaymentProvider {
    if (preferred) {
      const provider = this.providers.get(preferred);
      if (!provider) throw new BadRequestException(`Unknown provider: ${preferred}`);
      return provider;
    }

    // Auto-routing by currency
    if (currency === 'NGN') {
      return this.moniepoint; // Primary NG provider
    }
    return this.stripe; // Default international
  }

  async createPayment(input: CreatePaymentInput, preferred?: PaymentProviderName): Promise<PaymentIntent> {
    const provider = this.resolveProvider(input.currency, preferred);
    return provider.createPayment(input);
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<PaymentIntent> {
    const provider = this.providers.get(input.provider);
    if (!provider) throw new BadRequestException(`Unknown provider: ${input.provider}`);
    return provider.verifyPayment(input);
  }

  async refund(providerName: PaymentProviderName, input: RefundInput): Promise<RefundResult> {
    const provider = this.providers.get(providerName);
    if (!provider) throw new BadRequestException(`Unknown provider: ${providerName}`);
    return provider.refund(input);
  }
}
