import { Injectable, Logger } from '@nestjs/common';
import { AajProvider, AajAddress, AajPackageItem } from './aaj.provider';

export interface ShippingRate {
  carrier: string;
  service: string;
  estimatedDays: { min: number; max: number };
  /** Rate in MINOR units (kobo/cents) so it lines up with the rest of pricing. */
  rate: number;
  currency: string;
  /** AAJ draft booking id — passed through to create-booking later. */
  quoteId?: string;
  /** ISO timestamp the quote expires. */
  expiresAt?: string;
}

export interface ShippingRateInput {
  country: string;
  /** Human-readable state name. AAJ stateOrProvinceCode is resolved upstream. */
  state: string;
  weightKg: number;
  currency: string;
  subtotal: number;
  /** Optional structured shipping address for the AAJ live path. */
  recipient?: AajAddress;
  /** Sender address (branch we ship from). */
  sender?: AajAddress;
  /** Item-level data for the quote payload. */
  items?: AajPackageItem[];
  /** Customer-declared value of all items in NGN (major units). */
  itemsValueNgn?: number;
}

/**
 * Shipping rate calculator.
 *
 * Primary path: hit AAJ Express's POST /quote and surface the result
 * (one option per quote). The customer pays this fee as part of their
 * order total via Paystack.
 *
 * Fallback path: when the AAJ provider runs in stub mode (no API key)
 * OR the live call fails for any reason, we degrade to a zone-based
 * estimate so checkout never breaks. The fallback is deliberately
 * pessimistic (no free-shipping threshold per the latest business
 * decision) so we don't accidentally underquote.
 *
 * Returned `rate` is always in MINOR units (kobo). AAJ returns major
 * units (naira); we multiply by 100 once here. Every downstream
 * consumer expects kobo.
 */
@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  /**
   * NG zone fallbacks — used only when AAJ is unreachable. Rates are
   * in MINOR units (kobo). These figures are intentionally above what
   * AAJ usually charges; under-quoting at checkout would force us to
   * eat the difference.
   */
  private readonly NG_ZONES: Record<string, number> = {
    Lagos: 250000,
    Abuja: 350000,
    Rivers: 400000,
    Ogun: 300000,
    Oyo: 350000,
    DEFAULT: 500000,
  };

  constructor(private readonly aaj: AajProvider) {}

  /**
   * Return the available shipping rates for a quote. Always returns at
   * least one entry — AAJ's first option, or the fallback estimate.
   *
   * Caller passes a structured `recipient` + `sender` for the live
   * path. When either is missing we degrade to the fallback (the
   * /orders/quote endpoint, used during the checkout preview, may not
   * have address fields yet).
   */
  async calculateRates(input: ShippingRateInput): Promise<ShippingRate[]> {
    // Try AAJ first when we have enough address data.
    if (input.recipient && input.sender) {
      try {
        const res = await this.aaj.getQuote({
          sender: input.sender,
          receiver: input.recipient,
          itemsValueNgn:
            input.itemsValueNgn ??
            Math.max(0, Math.round(input.subtotal / 100)),
          weightKg: Math.max(0.1, input.weightKg),
          items: input.items,
          deliveryMode: 'DOOR_STEP',
        });
        if (res.ok) {
          // AAJ amounts are NGN major units → store as kobo.
          return [
            {
              carrier: 'AAJ Express',
              service: 'Door delivery',
              estimatedDays: { min: res.data.etaDays, max: res.data.etaDays + 2 },
              rate: Math.round(res.data.totalNgn * 100),
              currency: 'NGN',
              quoteId: res.data.bookingId,
              expiresAt: res.data.expiresAt,
            },
          ];
        }
        this.logger.warn(`AAJ quote failed: ${res.error} — using fallback.`);
      } catch (err) {
        this.logger.error(
          `AAJ quote threw: ${err instanceof Error ? err.message : 'Unknown'}`,
        );
      }
    }

    return this.fallbackRates(input);
  }

  /**
   * Fallback rate path. Used when AAJ is unreachable OR we don't have
   * a recipient/sender address yet. The 50k-free-shipping rule that
   * used to live here has been removed — every order pays shipping.
   */
  private fallbackRates(input: ShippingRateInput): ShippingRate[] {
    const rates: ShippingRate[] = [];

    if (input.country === 'NG') {
      const zoneRate =
        this.NG_ZONES[input.state] ?? this.NG_ZONES['DEFAULT']!;
      rates.push({
        carrier: 'AAJ Express',
        service: 'Door delivery (estimate)',
        estimatedDays: { min: 3, max: 7 },
        rate: zoneRate,
        currency: 'NGN',
      });
      rates.push({
        carrier: 'AAJ Express',
        service: 'Express (estimate)',
        estimatedDays: { min: 1, max: 3 },
        rate: Math.round(zoneRate * 1.8),
        currency: 'NGN',
      });
    } else {
      const baseRate = input.currency === 'USD' ? 2500 : 1500000;
      const perKg = input.currency === 'USD' ? 500 : 300000;
      const intlRate = baseRate + Math.ceil(input.weightKg) * perKg;
      rates.push({
        carrier: 'AAJ Express',
        service: 'International (estimate)',
        estimatedDays: { min: 10, max: 21 },
        rate: intlRate,
        currency: input.currency,
      });
    }

    return rates;
  }
}
