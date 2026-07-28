"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricingEngine = void 0;
const common_1 = require("@nestjs/common");
const coupons_service_1 = require("../coupons/coupons.service");
const coupon_entity_1 = require("../coupons/entities/coupon.entity");
const shipping_service_1 = require("../shipping/shipping.service");
let PricingEngine = class PricingEngine {
    constructor(couponsService, shippingService) {
        this.couponsService = couponsService;
        this.shippingService = shippingService;
    }
    async quote(items, context) {
        const currency = context.currency;
        const lines = items.map((item) => {
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
        const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0);
        const compareAtTotal = lines.reduce((sum, l) => {
            if (l.compareAtPrice && l.compareAtPrice > l.unitPrice) {
                return sum + (l.compareAtPrice - l.unitPrice) * l.quantity;
            }
            return sum;
        }, 0);
        let discountTotal = 0;
        let autoAppliedCode;
        let autoAppliedType;
        let autoAppliedDiscountAmount = 0;
        try {
            const resolved = await this.couponsService.resolveAutoApplyForLines(lines.map((l) => ({
                variantId: l.variantId,
                lineSubtotal: l.lineSubtotal - l.lineDiscount,
            })), currency, context.channel);
            if (resolved && resolved.totalDiscount > 0) {
                for (const line of lines) {
                    const d = resolved.perLine.get(line.variantId) ?? 0;
                    if (d > 0) {
                        line.lineDiscount += d;
                        line.lineTotal = line.lineSubtotal - line.lineDiscount;
                    }
                }
                discountTotal += resolved.totalDiscount;
                autoAppliedCode = resolved.coupon.code;
                autoAppliedType = resolved.coupon.discountType;
                autoAppliedDiscountAmount = resolved.totalDiscount;
            }
        }
        catch {
        }
        let couponResult;
        if (context.couponCode) {
            const subtotalAfterAutoApply = subtotal - discountTotal;
            try {
                couponResult = await this.couponsService.applyCoupon(context.couponCode, subtotalAfterAutoApply, currency, context.userId, context.channel);
                if (couponResult.valid) {
                    discountTotal += couponResult.discountAmount;
                }
            }
            catch {
                couponResult = undefined;
            }
        }
        const totalWeightKg = items.reduce((sum, i) => sum + (i.weightKg ?? 0.5) * i.quantity, 0);
        const subtotalAfterDiscount = subtotal - discountTotal;
        const availableShippingRates = await this.shippingService.calculateRates({
            country: context.country,
            state: context.state,
            weightKg: totalWeightKg,
            currency,
            subtotal: subtotalAfterDiscount,
        });
        let selectedShipping;
        if (context.shippingMethod && availableShippingRates.length > 0) {
            selectedShipping = availableShippingRates.find((r) => r.service === context.shippingMethod);
        }
        if (!selectedShipping && availableShippingRates.length > 0) {
            selectedShipping = availableShippingRates[0];
        }
        const shippingTotal = selectedShipping?.rate ?? 0;
        const taxTotal = 0;
        const grandTotal = Math.max(0, subtotalAfterDiscount + shippingTotal + taxTotal);
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
                    discountType: autoAppliedType ?? coupon_entity_1.DiscountType.PERCENTAGE,
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
};
exports.PricingEngine = PricingEngine;
exports.PricingEngine = PricingEngine = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [coupons_service_1.CouponsService,
        shipping_service_1.ShippingService])
], PricingEngine);
//# sourceMappingURL=pricing.engine.js.map