import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon, CouponStatus, DiscountType } from './entities/coupon.entity';

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

  /**
   * Validate and calculate the discount for a given subtotal.
   */
  async applyCoupon(
    code: string,
    subtotal: number,
    currency: string,
    _userId?: string,
  ): Promise<ApplyCouponResult> {
    const coupon = await this.findByCode(code);

    // Status check
    if (!coupon.isValid) {
      return { valid: false, code: coupon.code, discountType: coupon.discountType, discountAmount: 0, message: 'Coupon is no longer valid' };
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

  async findAll(): Promise<Coupon[]> {
    return this.couponRepo.find({ order: { createdAt: 'DESC' } });
  }

  async disable(id: string): Promise<Coupon> {
    const coupon = await this.couponRepo.findOneOrFail({ where: { id } });
    coupon.status = CouponStatus.DISABLED;
    return this.couponRepo.save(coupon);
  }
}
