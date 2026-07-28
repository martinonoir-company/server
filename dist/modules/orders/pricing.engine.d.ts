import { CouponsService } from '../coupons/coupons.service';
import { CouponChannel } from '../coupons/entities/coupon.entity';
import { ShippingService, ShippingRate } from '../shipping/shipping.service';
export interface QuoteItem {
    variantId: string;
    sku: string;
    productName: string;
    variantName?: string;
    quantity: number;
    unitPrice: number;
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
    channel?: CouponChannel;
}
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
export interface QuoteResult {
    currency: string;
    lines: QuoteLine[];
    subtotal: number;
    discountTotal: number;
    coupon?: {
        code: string;
        discountType: string;
        discountAmount: number;
    };
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
export declare class PricingEngine {
    private readonly couponsService;
    private readonly shippingService;
    constructor(couponsService: CouponsService, shippingService: ShippingService);
    quote(items: QuoteItem[], context: QuoteContext): Promise<QuoteResult>;
}
