import { BaseEntity } from '../../../shared/entities/base.entity';
export declare enum DiscountType {
    PERCENTAGE = "PERCENTAGE",
    FIXED_AMOUNT = "FIXED_AMOUNT",
    FREE_SHIPPING = "FREE_SHIPPING"
}
export declare enum CouponStatus {
    ACTIVE = "ACTIVE",
    EXPIRED = "EXPIRED",
    DISABLED = "DISABLED"
}
export declare enum CouponChannel {
    STOREFRONT = "STOREFRONT",
    MOBILE = "MOBILE",
    POS = "POS"
}
export declare const ALL_COUPON_CHANNELS: CouponChannel[];
export declare class Coupon extends BaseEntity {
    code: string;
    description?: string;
    discountType: DiscountType;
    discountValue: number;
    currency?: string;
    minimumOrderAmount: number;
    maximumDiscount: number;
    usageLimit: number;
    usageLimitPerCustomer: number;
    timesUsed: number;
    status: CouponStatus;
    startsAt?: Date;
    expiresAt?: Date;
    applicableProductIds: string[];
    applicableCategoryIds: string[];
    applicableVariantIds: string[];
    autoApply: boolean;
    applicableChannels: CouponChannel[];
    createdBy?: string;
    get isValid(): boolean;
}
