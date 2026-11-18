import { Injectable, Logger } from '@nestjs/common';
import { AajProvider, AajAddress, AajPackageItem } from './aaj.provider';
import { resolveNgState } from './ng-state-codes';

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

  /**
   * Per-state base fallback (kobo, for the FIRST kg). Covers all 36 states +
   * FCT so no state silently collapses to one flat DEFAULT. Grouped by rough
   * distance band from the Lagos dispatch hub. Used ONLY when live AAJ is
   * unreachable; checkout blocks on NG quote failure, so this is a last-resort
   * estimate (e.g. for the storefront preview before an address is complete).
   */
  private readonly NG_STATE_BASE: Record<string, number> = {
    // Lagos hub
    Lagos: 250000,
    // South-West / near
    Ogun: 300000,
    Oyo: 350000,
    Osun: 350000,
    Ondo: 350000,
    Ekiti: 380000,
    // South-South / South-East
    Edo: 400000,
    Delta: 420000,
    Rivers: 420000,
    Bayelsa: 450000,
    'Cross River': 480000,
    'Akwa Ibom': 470000,
    Anambra: 430000,
    Enugu: 450000,
    Imo: 450000,
    Abia: 450000,
    Ebonyi: 470000,
    // North-Central / FCT
    Kwara: 380000,
    Kogi: 400000,
    'Federal Capital Territory': 400000,
    Niger: 430000,
    Nasarawa: 450000,
    Benue: 470000,
    Plateau: 480000,
    // North-West
    Kaduna: 480000,
    Kano: 520000,
    Katsina: 540000,
    Jigawa: 560000,
    Kebbi: 560000,
    Sokoto: 580000,
    Zamfara: 560000,
    // North-East (farthest)
    Bauchi: 560000,
    Gombe: 580000,
    Taraba: 600000,
    Adamawa: 620000,
    Yobe: 640000,
    Borno: 660000,
  };

  /** Additional kobo charged per extra kg beyond the first, in the fallback. */
  private readonly NG_PER_EXTRA_KG = 60000;

  constructor(private readonly aaj: AajProvider) {}

  /**
   * Build the sender (dispatch branch) address for a shipping quote from
   * AAJ_SENDER_* env, defaulting to the Lagos hub. The checkout quote MUST
   * pass a sender for the live AAJ path to run (calculateRates only calls AAJ
   * when both recipient AND sender are present). Kept env-based and
   * dependency-free so both PricingEngine (preview) and OrdersService.checkout
   * (authoritative charge) can use the same sender without a Branch lookup.
   * The post-payment booking resolves the concrete branch separately; for a
   * domestic NG quote AAJ prices on the sender STATE, which is Lagos either
   * way, so the quoted and booked prices stay aligned.
   */
  buildSenderAddress(): AajAddress {
    const state = process.env['AAJ_SENDER_STATE'] ?? 'Lagos';
    const resolved = resolveNgState(state);
    return {
      name: process.env['AAJ_SENDER_NAME'] ?? 'Martinonoir',
      phone: process.env['AAJ_SENDER_PHONE'] ?? '+2348038010651',
      email: process.env['AAJ_SENDER_EMAIL'] ?? 'mail@martinonoir.com',
      company: 'Martinonoir',
      addressLine1: process.env['AAJ_SENDER_LINE1'] ?? '1 Admiralty Way',
      city: process.env['AAJ_SENDER_CITY'] ?? 'Lekki',
      state: resolved?.name ?? state,
      stateOrProvinceCode: resolved?.code ?? 'LA',
      country: 'Nigeria',
      countryCode: 'NG',
      postalCode: process.env['AAJ_SENDER_POSTAL'] ?? '101233',
    };
  }

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
      // Resolve the state name to its canonical form so aliases ("FCT",
      // "Abuja", "Akwa-Ibom"…) hit the right band instead of silently
      // collapsing to DEFAULT.
      const canonical = resolveNgState(input.state)?.name;
      const base =
        (canonical ? this.NG_STATE_BASE[canonical] : undefined) ??
        this.NG_ZONES['DEFAULT']!;
      // Scale with weight: base covers the first kg, each extra kg adds a
      // per-kg surcharge, so 1 vs 7 items no longer prices identically.
      const extraKg = Math.max(0, Math.ceil(input.weightKg) - 1);
      const zoneRate = base + extraKg * this.NG_PER_EXTRA_KG;
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
