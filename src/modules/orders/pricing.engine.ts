import { Injectable } from '@nestjs/common';
import { CouponsService, ApplyCouponResult } from '../coupons/coupons.service';
import { CouponChannel } from '../coupons/entities/coupon.entity';
import { ShippingService, ShippingRate } from '../shipping/shipping.service';

/**
 * Cart item input for the pricing engine.
 */
export interface QuoteItem {
  variantId: string;
  sku: string;
  productName: string;
  variantName?: string;
  quantity: number;
  /** Unit price in minor units (already resolved for the correct currency) */
  unitPrice: number;
  /** Compare-at price for "was/now" display */
  compareAtPrice?: number;
  weightKg?: number;
  options?: Record<string, string>;
}

export interface QuoteContext {
  currency: string;
  country: string;
  state: string;
  userId?: string;
  couponCode?: string;
  shippingMethod?: string;
  /** Sales channel — gates channel-scoped coupons. */
  channel?: CouponChannel;
}

/**
 * Fully-resolved line in the quote.
 */
export interface QuoteLine {
  variantId: string;
  sku: string;
  productName: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  compareAtPrice?: number;
  lineSubtotal: number;
  lineDiscount: number;
  lineTotal: number;
  options?: Record<string, string>;
}

/**
 * The complete quote result — everything the checkout needs.
 * All amounts in minor units.
 */
export interface QuoteResult {
  currency: string;
  lines: QuoteLine[];
  subtotal: number;
  discountTotal: number;
  coupon?: {
    code: string;
    discountType: string;
    discountAmount: number;
  };
  shippingTotal: number;
  shippingMethod?: ShippingRate;
  availableShippingRates: ShippingRate[];
  taxTotal: number;
  grandTotal: number;
  savings: number;
  itemCount: number;
}

/**
 * PricingEngine — deterministic, pure (side-effect-free) pricing calculator.
 * Clients NEVER compute final prices. All pricing flows through this engine.
 *
 * Evaluation order:
 * 1. Base prices (from variant)
 * 2. Line totals
 * 3. Coupon discount
 * 4. Shipping rates
 * 5. Tax (future: VAT for international)
 * 6. Grand total
 */
@Injectable()
export class PricingEngine {
  constructor(
    private readonly couponsService: CouponsService,
    private readonly shippingService: ShippingService,
  ) {}

  /**
   * Generate a complete price quote for a cart.
   * This is a READ-ONLY operation — no side effects, no inventory changes.
   */
  async quote(items: QuoteItem[], context: QuoteContext): Promise<QuoteResult> {
    const currency = context.currency;

    // 1. Build line items
    const lines: QuoteLine[] = items.map((item) => {
      const lineSubtotal = item.unitPrice * item.quantity;
      return {
        variantId: item.variantId,
        sku: item.sku,
        productName: item.productName,
        variantName: item.variantName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        compareAtPrice: item.compareAtPrice,
        lineSubtotal,
        lineDiscount: 0,
        lineTotal: lineSubtotal,
        options: item.options,
      };
    });

    // 2. Subtotal
    const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0);

    // 3. Compare-at savings (how much they save vs compare-at prices)
    const compareAtTotal = lines.reduce((sum, l) => {
      if (l.compareAtPrice && l.compareAtPrice > l.unitPrice) {
        return sum + (l.compareAtPrice - l.unitPrice) * l.quantity;
      }
      return sum;
    }, 0);

    // 4. Coupon
    let couponResult: ApplyCouponResult | undefined;
    let discountTotal = 0;

    if (context.couponCode) {
      try {
        couponResult = await this.couponsService.applyCoupon(
          context.couponCode,
          subtotal,
          currency,
          context.userId,
          context.channel,
        );
        if (couponResult.valid) {
          discountTotal = couponResult.discountAmount;
        }
      } catch {
        // Coupon not found — ignore, quote still valid
        couponResult = undefined;
      }
    }

    // 5. Shipping
    const totalWeightKg = items.reduce((sum, i) => sum + (i.weightKg ?? 0.5) * i.quantity, 0);
    const subtotalAfterDiscount = subtotal - discountTotal;

    const availableShippingRates = await this.shippingService.calculateRates({
      country: context.country,
      state: context.state,
      weightKg: totalWeightKg,
      currency,
      subtotal: subtotalAfterDiscount,
    });

    // Select shipping method (cheapest by default, or specified)
    let selectedShipping: ShippingRate | undefined;
    if (context.shippingMethod && availableShippingRates.length > 0) {
      selectedShipping = availableShippingRates.find(
        (r) => r.service === context.shippingMethod,
      );
    }
    if (!selectedShipping && availableShippingRates.length > 0) {
      selectedShipping = availableShippingRates[0]; // cheapest first
    }

    const shippingTotal = selectedShipping?.rate ?? 0;

    // 6. Tax (placeholder — Nigeria has no VAT on most consumer goods)
    const taxTotal = 0;

    // 7. Grand total
    const grandTotal = Math.max(0, subtotalAfterDiscount + shippingTotal + taxTotal);

    // 8. Total savings
    const savings = compareAtTotal + discountTotal;

    const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

    return {
      currency,
      lines,
      subtotal,
      discountTotal,
      coupon: couponResult?.valid
        ? {
            code: couponResult.code,
            discountType: couponResult.discountType,
            discountAmount: couponResult.discountAmount,
          }
        : undefined,
      shippingTotal,
      shippingMethod: selectedShipping,
      availableShippingRates,
      taxTotal,
      grandTotal,
      savings,
      itemCount,
    };
  }
}
