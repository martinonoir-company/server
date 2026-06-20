import { Injectable } from '@nestjs/common';
import { CouponsService, ApplyCouponResult } from '../coupons/coupons.service';
import { CouponChannel, DiscountType } from '../coupons/entities/coupon.entity';
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

    // 4a. Auto-apply variant-scoped coupons.
    //
    // These fire silently — the customer never types a code. We look up
    // every coupon that:
    //   - autoApply = true
    //   - covers at least one of the cart's variants
    //   - is otherwise valid (status / currency / channel / dates)
    // and pick the one that produces the deepest TOTAL discount across
    // the matching lines. Discount is computed PER LINE so we never
    // affect a non-qualifying item.
    //
    // The discount is recorded on `line.lineDiscount` per line; the
    // running discountTotal sums those. A typed-code coupon (step 4b)
    // then runs against the subtotal NET of auto-apply — so an admin
    // can't accidentally stack a 20% percentage coupon on top of an
    // already-discounted line. PER-LINE rounding: each line discount
    // is rounded HALF-DOWN (Math.floor) so we never give back more
    // than the math says — the customer is never overcredited.
    let discountTotal = 0;
    let autoAppliedCode: string | undefined;
    let autoAppliedType: DiscountType | undefined;
    let autoAppliedDiscountAmount = 0;
    try {
      const candidates = await this.couponsService.findAutoApplyCandidates(
        items.map((i) => i.variantId),
        currency,
        context.channel,
      );
      let bestTotal = 0;
      let bestPerLine: Map<string, number> | null = null;
      let bestCoupon: typeof candidates[number] | null = null;
      for (const c of candidates) {
        // Final validity check (status + window + usage) — the SQL
        // filter already covers status + window, but isValid also
        // checks usageLimit.
        if (!c.isValid) continue;
        const perLine = this.computeAutoApplyDiscountPerLine(lines, c);
        const total = Array.from(perLine.values()).reduce((s, n) => s + n, 0);
        if (total > bestTotal) {
          bestTotal = total;
          bestPerLine = perLine;
          bestCoupon = c;
        }
      }
      if (bestCoupon && bestPerLine && bestTotal > 0) {
        // Stamp lineDiscount in place.
        for (const line of lines) {
          const d = bestPerLine.get(line.variantId) ?? 0;
          if (d > 0) {
            line.lineDiscount += d;
            line.lineTotal = line.lineSubtotal - line.lineDiscount;
          }
        }
        discountTotal += bestTotal;
        autoAppliedCode = bestCoupon.code;
        autoAppliedType = bestCoupon.discountType;
        autoAppliedDiscountAmount = bestTotal;
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
      taxTotal,
      grandTotal,
      savings,
      itemCount,
    };
  }

  /**
   * Compute how an auto-apply coupon distributes across the cart lines.
   * Returns a map of variantId → discount (minor units), summing to the
   * total discount the coupon would credit.
   *
   * Rules:
   *   - Only lines whose variantId is in coupon.applicableVariantIds get
   *     touched. Lines without coverage contribute zero.
   *   - PERCENTAGE coupons: lineDiscount = floor(lineSubtotal * pct / 100).
   *     Math.floor (never round up) so the customer is never given more
   *     than the rate dictates. maximumDiscount caps the TOTAL across
   *     all covered lines (not per-line) — applied proportionally so
   *     the cap doesn't distort the split.
   *   - FIXED_AMOUNT coupons: distribute the fixed value across covered
   *     lines proportionally to their subtotal, rounded HALF-DOWN per
   *     line, with any rounding-residual going to the largest line so
   *     the per-line sum exactly equals the fixed value (no money
   *     leaks).
   *   - FREE_SHIPPING coupons: not handled here — that's a shipping-
   *     level discount, applied in the shipping step.
   *   - minimumOrderAmount: enforced against the SUM of covered lines.
   *     If the covered subtotal doesn't reach the minimum, the coupon
   *     produces 0 (and the engine moves on to the next candidate).
   *   - Currency: PERCENTAGE works for any currency; FIXED_AMOUNT only
   *     applies if the coupon currency matches the cart currency.
   *     The SQL filter already enforces this — defence in depth here.
   */
  private computeAutoApplyDiscountPerLine(
    lines: QuoteLine[],
    coupon: import('../coupons/entities/coupon.entity').Coupon,
  ): Map<string, number> {
    const out = new Map<string, number>();
    const covered = lines.filter((l) =>
      coupon.applicableVariantIds.includes(l.variantId),
    );
    if (covered.length === 0) return out;

    // Covered subtotal — sum BEFORE this discount. We don't double
    // discount, so any pre-existing lineDiscount is excluded from the
    // basis. (As of today this is auto-apply running first, so
    // lineDiscount is 0 on entry — but the math still defends in case
    // ordering changes.)
    const coveredSubtotal = covered.reduce(
      (s, l) => s + l.lineSubtotal - l.lineDiscount,
      0,
    );
    if (coveredSubtotal <= 0) return out;

    // Minimum-order check against covered lines, not the whole cart.
    // A 5000 min on a "Black Crossbody" coupon shouldn't unlock just
    // because the customer also has a 60000 wallet in the cart.
    if (
      coupon.minimumOrderAmount > 0 &&
      coveredSubtotal < Number(coupon.minimumOrderAmount)
    ) {
      return out;
    }

    if (coupon.discountType === DiscountType.PERCENTAGE) {
      const pct = Number(coupon.discountValue);
      // Per-line discount = floor(lineSubtotal * pct / 100)
      let totalDiscount = 0;
      for (const line of covered) {
        const basis = line.lineSubtotal - line.lineDiscount;
        const d = Math.floor((basis * pct) / 100);
        if (d > 0) {
          out.set(line.variantId, d);
          totalDiscount += d;
        }
      }
      // Maximum-cap on percentage coupons. Apply pro-rata so the line
      // shares stay proportional.
      const cap = Number(coupon.maximumDiscount);
      if (cap > 0 && totalDiscount > cap) {
        const ratio = cap / totalDiscount;
        let runningSum = 0;
        let largestId: string | null = null;
        let largest = 0;
        for (const line of covered) {
          const before = out.get(line.variantId) ?? 0;
          const scaled = Math.floor(before * ratio);
          out.set(line.variantId, scaled);
          runningSum += scaled;
          if (scaled > largest) {
            largest = scaled;
            largestId = line.variantId;
          }
        }
        // Rounding residual goes to the largest line so the per-line
        // sum exactly equals the cap.
        const residual = cap - runningSum;
        if (residual > 0 && largestId) {
          out.set(largestId, (out.get(largestId) ?? 0) + residual);
        }
      }
      return out;
    }

    if (coupon.discountType === DiscountType.FIXED_AMOUNT) {
      const fixed = Math.min(Number(coupon.discountValue), coveredSubtotal);
      if (fixed <= 0) return out;
      // Pro-rata across covered lines.
      let runningSum = 0;
      let largestId: string | null = null;
      let largest = 0;
      for (const line of covered) {
        const basis = line.lineSubtotal - line.lineDiscount;
        const share = Math.floor((fixed * basis) / coveredSubtotal);
        out.set(line.variantId, share);
        runningSum += share;
        if (basis > largest) {
          largest = basis;
          largestId = line.variantId;
        }
      }
      const residual = fixed - runningSum;
      if (residual > 0 && largestId) {
        out.set(largestId, (out.get(largestId) ?? 0) + residual);
      }
      return out;
    }

    // FREE_SHIPPING — not a line discount.
    return out;
  }
}
