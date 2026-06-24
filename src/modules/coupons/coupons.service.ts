import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Coupon,
  CouponChannel,
  CouponStatus,
  DiscountType,
} from './entities/coupon.entity';

export interface ApplyCouponResult {
  valid: boolean;
  code: string;
  discountType: DiscountType;
  discountAmount: number;
  message?: string;
}

@Injectable()
export class CouponsService {
  constructor(
    @InjectRepository(Coupon) private readonly couponRepo: Repository<Coupon>,
  ) {}

  async create(data: Partial<Coupon>): Promise<Coupon> {
    // Normalise code to uppercase
    if (data.code) data.code = data.code.toUpperCase().trim();

    const existing = await this.couponRepo.findOne({ where: { code: data.code } });
    if (existing) throw new BadRequestException(`Coupon code "${data.code}" already exists`);

    const coupon = this.couponRepo.create(data);
    return this.couponRepo.save(coupon);
  }

  async findByCode(code: string): Promise<Coupon> {
    const coupon = await this.couponRepo.findOne({
      where: { code: code.toUpperCase().trim() },
    });
    if (!coupon) throw new NotFoundException(`Coupon "${code}" not found`);
    return coupon;
  }

  async findById(id: string): Promise<Coupon> {
    const coupon = await this.couponRepo.findOne({ where: { id } });
    if (!coupon) throw new NotFoundException(`Coupon ${id} not found`);
    return coupon;
  }

  /**
   * Validate and calculate the discount for a given subtotal.
   *
   * `channel` is the sales channel the request originates from. A coupon
   * scoped to specific channels is rejected when applied from any other
   * channel. When the coupon's channel list is empty it applies everywhere.
   */
  async applyCoupon(
    code: string,
    subtotal: number,
    currency: string,
    _userId?: string,
    channel?: CouponChannel,
  ): Promise<ApplyCouponResult> {
    const coupon = await this.findByCode(code);

    // Status / date / usage check
    if (!coupon.isValid) {
      return { valid: false, code: coupon.code, discountType: coupon.discountType, discountAmount: 0, message: 'Coupon is no longer valid' };
    }

    // Channel check — empty list means "all channels".
    if (
      channel &&
      Array.isArray(coupon.applicableChannels) &&
      coupon.applicableChannels.length > 0 &&
      !coupon.applicableChannels.includes(channel)
    ) {
      return { valid: false, code: coupon.code, discountType: coupon.discountType, discountAmount: 0, message: 'Coupon is not valid on this channel' };
    }

    // Currency check for fixed-amount coupons
    if (coupon.discountType === DiscountType.FIXED_AMOUNT && coupon.currency && coupon.currency !== currency) {
      return { valid: false, code: coupon.code, discountType: coupon.discountType, discountAmount: 0, message: `Coupon is only valid for ${coupon.currency} orders` };
    }

    // Minimum order check
    if (subtotal < coupon.minimumOrderAmount) {
      return { valid: false, code: coupon.code, discountType: coupon.discountType, discountAmount: 0, message: `Minimum order amount not met` };
    }

    // Calculate discount
    let discountAmount = 0;

    switch (coupon.discountType) {
      case DiscountType.PERCENTAGE:
        discountAmount = Math.floor((subtotal * Number(coupon.discountValue)) / 100);
        if (coupon.maximumDiscount > 0) {
          discountAmount = Math.min(discountAmount, Number(coupon.maximumDiscount));
        }
        break;

      case DiscountType.FIXED_AMOUNT:
        discountAmount = Math.min(Number(coupon.discountValue), subtotal);
        break;

      case DiscountType.FREE_SHIPPING:
        discountAmount = 0; // Handled at shipping level
        break;
    }

    return {
      valid: true,
      code: coupon.code,
      discountType: coupon.discountType,
      discountAmount,
    };
  }

  /**
   * Find auto-apply coupons that cover at least one of the supplied
   * cart variant IDs. Used by the storefront / mobile / POS cart hook
   * to surface a rescue discount silently — the customer never types
   * a code.
   *
   * Returns all matches, sorted by discount magnitude (deeper first)
   * so the caller can pick the most generous. Caller is responsible
   * for verifying status/expiry/usage on the chosen coupon — we
   * filter to ACTIVE here but the pricing engine re-checks via
   * coupon.isValid before applying.
   */
  async findAutoApplyCandidates(
    variantIds: string[],
    currency: string,
    channel?: CouponChannel,
  ): Promise<Coupon[]> {
    if (variantIds.length === 0) return [];

    // jsonb ?| operator: "does the array contain ANY of these strings".
    // Variant-scoped coupons match if applicableVariantIds overlaps the
    // cart's variants. Coupons with an EMPTY applicableVariantIds list
    // are NOT considered for auto-apply — auto-apply is intended for
    // targeted rescue discounts; a "whole catalogue auto-apply" would
    // be a sale, which the admin should run differently.
    // NOTE: use the FUNCTION forms jsonb_exists_any / jsonb_exists rather
    // than the `?|` and `?` operators. TypeORM's query builder treats `?`
    // as a parameter placeholder and mangles those operators, so the
    // operator form silently matched nothing — which is exactly why
    // auto-apply coupons never fired. The function forms are the
    // documented equivalents and bind cleanly.
    const qb = this.couponRepo
      .createQueryBuilder('c')
      .where('c."autoApply" = true')
      .andWhere(`c.status = :st`, { st: CouponStatus.ACTIVE })
      .andWhere(`jsonb_array_length(c."applicableVariantIds") > 0`)
      .andWhere(
        `jsonb_exists_any(c."applicableVariantIds", ARRAY[:...variantIds]::text[])`,
        { variantIds },
      );

    // Channel + currency filters mirror the typed-code path.
    if (channel) {
      qb.andWhere(
        `(jsonb_array_length(c."applicableChannels") = 0 OR jsonb_exists(c."applicableChannels", :ch))`,
        { ch: channel },
      );
    }
    // Currency only matters for FIXED_AMOUNT coupons. PERCENTAGE
    // discounts are currency-agnostic.
    qb.andWhere(
      `(c."discountType" = :pct OR c.currency = :cur)`,
      { pct: DiscountType.PERCENTAGE, cur: currency },
    );

    // Inside the window (startsAt / expiresAt nullable).
    const now = new Date();
    qb.andWhere(`(c."startsAt" IS NULL OR c."startsAt" <= :now)`, { now });
    qb.andWhere(`(c."expiresAt" IS NULL OR c."expiresAt" >= :now)`, { now });

    return qb.getMany();
  }

  /**
   * Storefront discount badge: for each requested variant, the best active
   * promotional discount (auto-apply, variant-scoped). Returns only variants
   * that actually have a live promotion, so the PDP can render "20% off" /
   * "₦400 off" when a variant is selected. No order context — this is a
   * display hint, not the binding discount (the quote/checkout remains the
   * source of truth for the amount actually applied).
   */
  async findVariantPromotions(
    variantIds: string[],
    currency: string,
    channel?: CouponChannel,
  ): Promise<
    Array<{
      variantId: string;
      discountType: DiscountType;
      discountValue: number;
      currency: string | null;
    }>
  > {
    const candidates = (await this.findAutoApplyCandidates(
      variantIds,
      currency,
      channel,
    )).filter((c) => c.isValid);
    if (candidates.length === 0) return [];

    // Rank "best" discount per variant. Percentage and fixed aren't directly
    // comparable without a price, so prefer the larger percentage, else the
    // larger fixed amount, and let percentage win ties — that's the headline
    // a shopper expects to see.
    const best = new Map<
      string,
      { discountType: DiscountType; discountValue: number; currency: string | null }
    >();
    const weight = (c: Coupon) =>
      c.discountType === DiscountType.PERCENTAGE
        ? 1_000_000 + Number(c.discountValue)
        : Number(c.discountValue);
    for (const c of candidates) {
      if (c.discountType === DiscountType.FREE_SHIPPING) continue;
      for (const vId of c.applicableVariantIds) {
        if (!variantIds.includes(vId)) continue;
        const prev = best.get(vId);
        const cand = {
          discountType: c.discountType,
          discountValue: Number(c.discountValue),
          currency: c.currency ?? null,
        };
        if (
          !prev ||
          weight(c) >
            weight({
              discountType: prev.discountType,
              discountValue: prev.discountValue,
            } as Coupon)
        ) {
          best.set(vId, cand);
        }
      }
    }
    return Array.from(best.entries()).map(([variantId, v]) => ({
      variantId,
      ...v,
    }));
  }

  /**
   * Pick the best auto-apply coupon for a set of cart lines and return
   * the resolved per-line discount distribution. This is the single
   * source-of-truth math reused by:
   *   - PricingEngine (quote previews — storefront / mobile / POS)
   *   - OrdersService.checkout (storefront / mobile commit)
   *   - PosSyncService.processTransaction (POS commit)
   *
   * Returns null when no auto-apply coupon covers any line. Caller
   * applies the per-line discounts to OrderItem.discountAmount and the
   * total to order.discountTotal.
   */
  async resolveAutoApplyForLines(
    lines: { variantId: string; lineSubtotal: number }[],
    currency: string,
    channel?: CouponChannel,
  ): Promise<{
    coupon: Coupon;
    perLine: Map<string, number>;
    totalDiscount: number;
  } | null> {
    const variantIds = lines.map((l) => l.variantId);
    const candidates = await this.findAutoApplyCandidates(
      variantIds,
      currency,
      channel,
    );
    if (candidates.length === 0) return null;
    let best: {
      coupon: Coupon;
      perLine: Map<string, number>;
      totalDiscount: number;
    } | null = null;
    for (const c of candidates) {
      if (!c.isValid) continue;
      const perLine = this.computeAutoApplyPerLine(lines, c);
      const totalDiscount = Array.from(perLine.values()).reduce(
        (s, n) => s + n,
        0,
      );
      if (totalDiscount > (best?.totalDiscount ?? 0)) {
        best = { coupon: c, perLine, totalDiscount };
      }
    }
    return best;
  }

  /**
   * Per-line discount math for an auto-apply coupon. Kept identical to
   * the PricingEngine and OrdersService implementations — see those
   * files for the comment trail on rounding and cap semantics.
   *
   * Caller passes a list of lines with their CURRENT subtotal (the
   * basis we discount against). lineSubtotal must NOT already include
   * any previous discount; if you've stacked an earlier auto-apply,
   * pass the residual.
   */
  computeAutoApplyPerLine(
    lines: { variantId: string; lineSubtotal: number }[],
    coupon: Coupon,
  ): Map<string, number> {
    const out = new Map<string, number>();
    const covered = lines.filter((l) =>
      coupon.applicableVariantIds.includes(l.variantId),
    );
    if (covered.length === 0) return out;
    const coveredSubtotal = covered.reduce(
      (s, l) => s + l.lineSubtotal,
      0,
    );
    if (coveredSubtotal <= 0) return out;
    if (
      Number(coupon.minimumOrderAmount) > 0 &&
      coveredSubtotal < Number(coupon.minimumOrderAmount)
    ) {
      return out;
    }

    if (coupon.discountType === DiscountType.PERCENTAGE) {
      const pct = Number(coupon.discountValue);
      let totalDiscount = 0;
      for (const line of covered) {
        const d = Math.floor((line.lineSubtotal * pct) / 100);
        if (d > 0) {
          out.set(line.variantId, d);
          totalDiscount += d;
        }
      }
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
        const residual = cap - runningSum;
        if (residual > 0 && largestId) {
          out.set(largestId, (out.get(largestId) ?? 0) + residual);
        }
      }
      return out;
    }

    if (coupon.discountType === DiscountType.FIXED_AMOUNT) {
      const fixed = Math.min(
        Number(coupon.discountValue),
        coveredSubtotal,
      );
      if (fixed <= 0) return out;
      let runningSum = 0;
      let largestId: string | null = null;
      let largest = 0;
      for (const line of covered) {
        const share = Math.floor(
          (fixed * line.lineSubtotal) / coveredSubtotal,
        );
        out.set(line.variantId, share);
        runningSum += share;
        if (line.lineSubtotal > largest) {
          largest = line.lineSubtotal;
          largestId = line.variantId;
        }
      }
      const residual = fixed - runningSum;
      if (residual > 0 && largestId) {
        out.set(largestId, (out.get(largestId) ?? 0) + residual);
      }
      return out;
    }

    return out;
  }

  /**
   * Increment usage count after successful order.
   */
  async recordUsage(code: string): Promise<void> {
    await this.couponRepo.increment({ code: code.toUpperCase() }, 'timesUsed', 1);
  }

  /**
   * Paginated list of coupons, newest first. Optional filters: status, and
   * a free-text search across code + description.
   */
  async findAll(opts: {
    page?: number;
    limit?: number;
    status?: CouponStatus;
    search?: string;
  } = {}): Promise<{
    items: Coupon[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const page = Math.max(1, Math.floor(opts.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.floor(opts.limit ?? 20)));

    const qb = this.couponRepo
      .createQueryBuilder('c')
      .orderBy('c.createdAt', 'DESC');

    if (opts.status) {
      qb.andWhere('c.status = :status', { status: opts.status });
    }
    if (opts.search && opts.search.trim()) {
      const term = `%${opts.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(c.code) LIKE :term OR LOWER(c.description) LIKE :term)',
        { term },
      );
    }

    qb.skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Update a coupon. `code` is immutable — it may already be printed,
   * shared, or referenced by past orders — so it is never changed here.
   */
  async update(id: string, data: Partial<Coupon>): Promise<Coupon> {
    const coupon = await this.findById(id);
    // Guard: the code is identity — do not allow it to drift.
    delete (data as { code?: string }).code;
    Object.assign(coupon, data);
    return this.couponRepo.save(coupon);
  }

  /** Soft-delete a coupon. */
  async remove(id: string): Promise<void> {
    const coupon = await this.findById(id);
    await this.couponRepo.softRemove(coupon);
  }

  async disable(id: string): Promise<Coupon> {
    const coupon = await this.findById(id);
    coupon.status = CouponStatus.DISABLED;
    return this.couponRepo.save(coupon);
  }
}
