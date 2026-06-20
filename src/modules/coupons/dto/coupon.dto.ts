import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsArray,
  IsBoolean,
  IsISO8601,
  Min,
  MaxLength,
  MinLength,
  ArrayUnique,
} from 'class-validator';
import {
  CouponChannel,
  CouponStatus,
  DiscountType,
} from '../entities/coupon.entity';

/**
 * Create a promotion (coupon / discount).
 *
 * `discountValue` semantics:
 *   - PERCENTAGE   → whole percent (e.g. 15 = 15% off)
 *   - FIXED_AMOUNT → amount in minor units (kobo/cents)
 *   - FREE_SHIPPING→ ignored (shipping is zeroed)
 */
export class CreateCouponDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsEnum(DiscountType)
  discountType!: DiscountType;

  @IsInt()
  @Min(0)
  discountValue!: number;

  /** Required for FIXED_AMOUNT — the currency the amount is denominated in. */
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minimumOrderAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maximumDiscount?: number;

  /** Total uses allowed across all customers. 0 = unlimited. */
  @IsOptional()
  @IsInt()
  @Min(0)
  usageLimit?: number;

  /** Uses allowed per customer. 0 = unlimited. */
  @IsOptional()
  @IsInt()
  @Min(0)
  usageLimitPerCustomer?: number;

  @IsOptional()
  @IsEnum(CouponStatus)
  status?: CouponStatus;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableProductIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableCategoryIds?: string[];

  /** Channels the coupon applies on. Empty / omitted = all channels. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(CouponChannel, { each: true })
  applicableChannels?: CouponChannel[];

  /** Variant IDs the coupon applies to. Empty / omitted = all variants. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableVariantIds?: string[];

  /**
   * When TRUE, the coupon is silently attached by the cart's auto-apply
   * hook whenever the cart contains a qualifying variant. The customer
   * never needs to type a code. Use this for targeted rescue discounts
   * — combine with `applicableVariantIds` to scope the lift.
   */
  @IsOptional()
  @IsBoolean()
  autoApply?: boolean;
}

/** Update a promotion. All fields optional; `code` cannot be changed. */
export class UpdateCouponDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minimumOrderAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maximumDiscount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  usageLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  usageLimitPerCustomer?: number;

  @IsOptional()
  @IsEnum(CouponStatus)
  status?: CouponStatus;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableProductIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableCategoryIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(CouponChannel, { each: true })
  applicableChannels?: CouponChannel[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableVariantIds?: string[];

  @IsOptional()
  @IsBoolean()
  autoApply?: boolean;
}
