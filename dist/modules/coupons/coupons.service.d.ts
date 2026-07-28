import { Repository } from 'typeorm';
import { Coupon, CouponChannel, CouponStatus, DiscountType } from './entities/coupon.entity';
import { ProductVariant } from '../products/entities/product.entity';
export interface ApplyCouponResult {
    valid: boolean;
    code: string;
    discountType: DiscountType;
    discountAmount: number;
    message?: string;
}
export declare class CouponsService {
    private readonly couponRepo;
    private readonly variantRepo;
    constructor(couponRepo: Repository<Coupon>, variantRepo: Repository<ProductVariant>);
    create(data: Partial<Coupon>): Promise<Coupon>;
    private expandProductScopeToVariants;
    findByCode(code: string): Promise<Coupon>;
    findById(id: string): Promise<Coupon>;
    applyCoupon(code: string, subtotal: number, currency: string, _userId?: string, channel?: CouponChannel): Promise<ApplyCouponResult>;
    findAutoApplyCandidates(variantIds: string[], currency: string, channel?: CouponChannel): Promise<Coupon[]>;
    findVariantPromotions(variantIds: string[], currency: string, channel?: CouponChannel): Promise<Array<{
        variantId: string;
        discountType: DiscountType;
        discountValue: number;
        currency: string | null;
    }>>;
    resolveAutoApplyForLines(lines: {
        variantId: string;
        lineSubtotal: number;
    }[], currency: string, channel?: CouponChannel): Promise<{
        coupon: Coupon;
        perLine: Map<string, number>;
        totalDiscount: number;
    } | null>;
    computeAutoApplyPerLine(lines: {
        variantId: string;
        lineSubtotal: number;
    }[], coupon: Coupon): Map<string, number>;
    recordUsage(code: string): Promise<void>;
    findAll(opts?: {
        page?: number;
        limit?: number;
        status?: CouponStatus;
        search?: string;
    }): Promise<{
        items: Coupon[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    update(id: string, data: Partial<Coupon>): Promise<Coupon>;
    remove(id: string): Promise<void>;
    disable(id: string): Promise<Coupon>;
}
