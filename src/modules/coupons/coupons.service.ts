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
