import { CouponsService } from './coupons.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';
import { Coupon, CouponStatus } from './entities/coupon.entity';
export declare class CouponsController {
    private readonly couponsService;
    constructor(couponsService: CouponsService);
    findAll(page?: string, limit?: string, status?: string, search?: string): Promise<{
        data: {
            items: Coupon[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    findOne(id: string): Promise<{
        data: Coupon;
    }>;
    create(dto: CreateCouponDto, req: any): Promise<{
        data: Coupon;
    }>;
    update(id: string, dto: UpdateCouponDto): Promise<{
        data: Coupon;
    }>;
    setStatus(id: string, status: CouponStatus): Promise<{
        data: Coupon;
    }>;
    remove(id: string): Promise<void>;
    findAutoApply(variantIds?: string | string[], currency?: string, channel?: string): Promise<{
        data: {
            id: string;
            code: string;
            description: string | undefined;
            discountType: import("./entities/coupon.entity").DiscountType;
            discountValue: number;
            currency: string | undefined;
            minimumOrderAmount: number;
            maximumDiscount: number;
            applicableVariantIds: string[];
            autoApply: boolean;
        }[];
    }>;
    findActivePromotions(variantIds?: string | string[], currency?: string, channel?: string): Promise<{
        data: {
            variantId: string;
            discountType: import("./entities/coupon.entity").DiscountType;
            discountValue: number;
            currency: string | null;
        }[];
    }>;
    private toEntityShape;
}
