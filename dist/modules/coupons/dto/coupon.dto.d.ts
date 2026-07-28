import { CouponChannel, CouponStatus, DiscountType } from '../entities/coupon.entity';
export declare class CreateCouponDto {
    code: string;
    description?: string;
    discountType: DiscountType;
    discountValue: number;
    currency?: string;
    minimumOrderAmount?: number;
    maximumDiscount?: number;
    usageLimit?: number;
    usageLimitPerCustomer?: number;
    status?: CouponStatus;
    startsAt?: string;
    expiresAt?: string;
    applicableProductIds?: string[];
    applicableCategoryIds?: string[];
    applicableChannels?: CouponChannel[];
    applicableVariantIds?: string[];
    autoApply?: boolean;
}
export declare class UpdateCouponDto {
    description?: string;
    discountType?: DiscountType;
    discountValue?: number;
    currency?: string;
    minimumOrderAmount?: number;
    maximumDiscount?: number;
    usageLimit?: number;
    usageLimitPerCustomer?: number;
    status?: CouponStatus;
    startsAt?: string;
    expiresAt?: string;
    applicableProductIds?: string[];
    applicableCategoryIds?: string[];
    applicableChannels?: CouponChannel[];
    applicableVariantIds?: string[];
    autoApply?: boolean;
}
