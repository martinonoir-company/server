import { Injectable } from '@nestjs/common';
import { CouponsService, ApplyCouponResult } from '../coupons/coupons.service';
import { CouponChannel, DiscountType } from '../coupons/entities/coupon.entity';
import { ShippingService, ShippingRate } from '../shipping/shipping.service';
import { resolveNgState } from '../shipping/ng-state-codes';

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
  /**
   * Recipient address fields for the live AAJ quote. When present (the
   * customer has reached the Review step with a full address), the engine
   * passes a recipient + the configured sender into the shipping service so
   * the previewed shipping fee is the real, input-sensitive AAJ price — the
   * same one checkout will charge. When absent, shipping falls back to a
   * zone estimate (early cart preview, before an address exists).
   */
  recipient?: {
    name?: string;
    phone?: string;
    email?: string;
    line1?: string;
    line2?: string;
    city?: string;
    postalCode?: string;
    /** Optional explicit AAJ state code; resolved from `state` when omitted. */
    stateCode?: string;
  };
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
  /**
   * Typed-code coupon applied to the quote, if any. Auto-applied
   * coupons surface separately on `autoApply` so the UI can show both.
   */
  coupon?: {
    code: string;
    discountType: string;
    discountAmount: number;
  };
  /**
   * Variant-scoped coupon the engine attached silently. The customer
   * never typed this in. Discount distributed across the matching
   * cart lines via lineDiscount.
   */
  autoApply?: {
    code: string;
    discountType: string;
    discountAmount: number;
  };
  shippingTotal: number;
  shippingMethod?: ShippingRate;
  availableShippingRates: ShippingRate[];
  /**
   * True when the selected shipping rate is a live AAJ quote (has a draft
   * booking id), false when it's a zone fallback estimate. The checkout
   * preview uses this to avoid showing a fallback price the customer could
   * not actually be charged (NG checkout blocks on a non-live quote).
   */
  shippingLive: boolean;
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

    // 4a. Auto-apply variant-scoped coupons (silent — customer never
    // types a code). Math centralised in CouponsService.resolveAutoApply
    // so PricingEngine, OrdersService.checkout and PosSyncService all
    // produce identical figures.
    let discountTotal = 0;
    let autoAppliedCode: string | undefined;
    let autoAppliedType: DiscountType | undefined;
    let autoAppliedDiscountAmount = 0;
    try {
      const resolved = await this.couponsService.resolveAutoApplyForLines(
        lines.map((l) => ({
          variantId: l.variantId,
          lineSubtotal: l.lineSubtotal - l.lineDiscount,
        })),
        currency,
        context.channel,
      );
      if (resolved && resolved.totalDiscount > 0) {
        for (const line of lines) {
          const d = resolved.perLine.get(line.variantId) ?? 0;
          if (d > 0) {
            line.lineDiscount += d;
            line.lineTotal = line.lineSubtotal - line.lineDiscount;
          }
        }
        discountTotal += resolved.totalDiscount;
        autoAppliedCode = resolved.coupon.code;
        autoAppliedType = resolved.coupon.discountType;
        autoAppliedDiscountAmount = resolved.totalDiscount;
      }
    } catch {
      // Auto-apply failures must never break the quote. Cart still
      // returns full subtotal unmodified.
    }

    // 4b. Typed-code coupon — runs AFTER auto-apply on the residual
    // subtotal so the coupon math operates on the already-discounted
    // figure. This prevents stacking abuse (typed code re-discounting
    // a line auto-apply already touched).
    let couponResult: ApplyCouponResult | undefined;
    if (context.couponCode) {
      const subtotalAfterAutoApply = subtotal - discountTotal;
      try {
        couponResult = await this.couponsService.applyCoupon(
          context.couponCode,
          subtotalAfterAutoApply,
          currency,
          context.userId,
          context.channel,
        );
        if (couponResult.valid) {
          discountTotal += couponResult.discountAmount;
        }
      } catch {
        // Coupon not found — ignore, quote still valid
        couponResult = undefined;
      }
    }

    // 5. Shipping
    const totalWeightKg = items.reduce((sum, i) => sum + (i.weightKg ?? 0.5) * i.quantity, 0);
    const subtotalAfterDiscount = subtotal - discountTotal;

    // When the customer has a full recipient address (Review step), pass
    // recipient + the configured sender so the preview reaches the live AAJ
    // quote (calculateRates only calls AAJ when BOTH are present). Without a
    // recipient (early cart preview) it uses the zone fallback.
    const cc =
      context.country.length === 2 ? context.country.toUpperCase() : 'NG';
    const r = context.recipient;
    const hasRecipient = !!(r && r.line1 && r.city);
    const recipient = hasRecipient
      ? {
          name: r!.name ?? 'Customer',
          phone: r!.phone ?? '+2348000000000',
          email: r!.email ?? 'noreply@martinonoir.com',
          addressLine1: r!.line1!,
          addressLine2: r!.line2,
          city: r!.city!,
          state: context.state,
          stateOrProvinceCode:
            r!.stateCode ??
            (cc === 'NG'
              ? (resolveNgState(context.state)?.code ?? undefined)
              : undefined),
          country: cc === 'NG' ? 'Nigeria' : context.country,
          countryCode: cc,
          postalCode: r!.postalCode ?? '100001',
        }
      : undefined;
    const sender = hasRecipient
      ? this.shippingService.buildSenderAddress()
      : undefined;

    const availableShippingRates = await this.shippingService.calculateRates({
      country: context.country,
      state: context.state,
      weightKg: totalWeightKg,
      currency,
      subtotal: subtotalAfterDiscount,
      ...(recipient ? { recipient } : {}),
      ...(sender ? { sender } : {}),
      itemsValueNgn: Math.round(subtotalAfterDiscount / 100),
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
      autoApply: autoAppliedCode
        ? {
            code: autoAppliedCode,
            discountType: autoAppliedType ?? DiscountType.PERCENTAGE,
            discountAmount: autoAppliedDiscountAmount,
          }
        : undefined,
      shippingTotal,
      shippingMethod: selectedShipping,
      availableShippingRates,
      shippingLive: !!selectedShipping?.quoteId,
      taxTotal,
      grandTotal,
      savings,
      itemCount,
    };
  }

}
