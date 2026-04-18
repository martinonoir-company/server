import { Injectable } from '@nestjs/common';

export interface ShippingRate {
  carrier: string;
  service: string;
  estimatedDays: { min: number; max: number };
  /** Rate in minor units */
  rate: number;
  currency: string;
}

export interface ShippingRateInput {
  country: string;
  state: string;
  weightKg: number;
  currency: string;
  subtotal: number;
}

/**
 * Shipping rate calculator.
 * Uses zone-based flat rates for NG domestic, and weight-based for international.
 * TODO: Integrate with real carriers (GIG Logistics, DHL, FedEx) when ready.
 */
@Injectable()
export class ShippingService {
  /** Nigerian domestic zones */
  private readonly NG_ZONES: Record<string, number> = {
    'Lagos': 250000,       // ₦2,500
    'Abuja': 350000,       // ₦3,500
    'Rivers': 400000,      // ₦4,000
    'Ogun': 300000,        // ₦3,000
    'Oyo': 350000,         // ₦3,500
    'DEFAULT': 500000,     // ₦5,000 for other states
  };

  /** Free shipping threshold (minor units) */
  private readonly FREE_SHIPPING_THRESHOLD_NGN = 5000000; // ₦50,000
  private readonly FREE_SHIPPING_THRESHOLD_USD = 10000;   // $100

  async calculateRates(input: ShippingRateInput): Promise<ShippingRate[]> {
    const rates: ShippingRate[] = [];

    if (input.country === 'NG') {
      // Check free shipping threshold
      const threshold = input.currency === 'USD'
        ? this.FREE_SHIPPING_THRESHOLD_USD
        : this.FREE_SHIPPING_THRESHOLD_NGN;

      if (input.subtotal >= threshold) {
        rates.push({
          carrier: 'MartiniNoir',
          service: 'Free Shipping',
          estimatedDays: { min: 3, max: 7 },
          rate: 0,
          currency: input.currency,
        });
        return rates;
      }

      // Zone-based domestic
      const zoneRate = this.NG_ZONES[input.state] ?? this.NG_ZONES['DEFAULT'];
      rates.push({
        carrier: 'Standard Delivery',
        service: 'Domestic',
        estimatedDays: { min: 3, max: 7 },
        rate: zoneRate!,
        currency: 'NGN',
      });

      // Express option
      rates.push({
        carrier: 'Express Delivery',
        service: 'Domestic Express',
        estimatedDays: { min: 1, max: 3 },
        rate: Math.round(zoneRate! * 1.8),
        currency: 'NGN',
      });

    } else {
      // International — weight-based
      const baseRate = input.currency === 'USD' ? 2500 : 1500000; // $25 or ₦15,000
      const perKg = input.currency === 'USD' ? 500 : 300000;     // $5/kg or ₦3,000/kg
      const intlRate = baseRate + Math.ceil(input.weightKg) * perKg;

      rates.push({
        carrier: 'International Standard',
        service: 'International',
        estimatedDays: { min: 10, max: 21 },
        rate: intlRate,
        currency: input.currency,
      });

      rates.push({
        carrier: 'International Express',
        service: 'Express International',
        estimatedDays: { min: 5, max: 10 },
        rate: Math.round(intlRate * 2),
        currency: input.currency,
      });
    }

    return rates;
  }
}
