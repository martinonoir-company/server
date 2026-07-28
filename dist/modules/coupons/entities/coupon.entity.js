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
exports.Coupon = exports.ALL_COUPON_CHANNELS = exports.CouponChannel = exports.CouponStatus = exports.DiscountType = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../shared/entities/base.entity");
var DiscountType;
(function (DiscountType) {
    DiscountType["PERCENTAGE"] = "PERCENTAGE";
    DiscountType["FIXED_AMOUNT"] = "FIXED_AMOUNT";
    DiscountType["FREE_SHIPPING"] = "FREE_SHIPPING";
})(DiscountType || (exports.DiscountType = DiscountType = {}));
var CouponStatus;
(function (CouponStatus) {
    CouponStatus["ACTIVE"] = "ACTIVE";
    CouponStatus["EXPIRED"] = "EXPIRED";
    CouponStatus["DISABLED"] = "DISABLED";
})(CouponStatus || (exports.CouponStatus = CouponStatus = {}));
var CouponChannel;
(function (CouponChannel) {
    CouponChannel["STOREFRONT"] = "STOREFRONT";
    CouponChannel["MOBILE"] = "MOBILE";
    CouponChannel["POS"] = "POS";
})(CouponChannel || (exports.CouponChannel = CouponChannel = {}));
exports.ALL_COUPON_CHANNELS = [
    CouponChannel.STOREFRONT,
    CouponChannel.MOBILE,
    CouponChannel.POS,
];
let Coupon = class Coupon extends base_entity_1.BaseEntity {
    get isValid() {
        if (this.status !== CouponStatus.ACTIVE)
            return false;
        const now = new Date();
        if (this.startsAt && now < this.startsAt)
            return false;
        if (this.expiresAt && now > this.expiresAt)
            return false;
        if (this.usageLimit > 0 && this.timesUsed >= this.usageLimit)
            return false;
        return true;
    }
};
exports.Coupon = Coupon;
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ type: 'varchar', length: 50 }),
    __metadata("design:type", String)
], Coupon.prototype, "code", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 200, nullable: true }),
    __metadata("design:type", String)
], Coupon.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: DiscountType }),
    __metadata("design:type", String)
], Coupon.prototype, "discountType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], Coupon.prototype, "discountValue", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 3, nullable: true }),
    __metadata("design:type", String)
], Coupon.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint', default: 0 }),
    __metadata("design:type", Number)
], Coupon.prototype, "minimumOrderAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint', default: 0 }),
    __metadata("design:type", Number)
], Coupon.prototype, "maximumDiscount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], Coupon.prototype, "usageLimit", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 1 }),
    __metadata("design:type", Number)
], Coupon.prototype, "usageLimitPerCustomer", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], Coupon.prototype, "timesUsed", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: CouponStatus, default: CouponStatus.ACTIVE }),
    __metadata("design:type", String)
], Coupon.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Date)
], Coupon.prototype, "startsAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Date)
], Coupon.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', default: [] }),
    __metadata("design:type", Array)
], Coupon.prototype, "applicableProductIds", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', default: [] }),
    __metadata("design:type", Array)
], Coupon.prototype, "applicableCategoryIds", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', default: [] }),
    __metadata("design:type", Array)
], Coupon.prototype, "applicableVariantIds", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], Coupon.prototype, "autoApply", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', default: [] }),
    __metadata("design:type", Array)
], Coupon.prototype, "applicableChannels", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26, nullable: true }),
    __metadata("design:type", String)
], Coupon.prototype, "createdBy", void 0);
exports.Coupon = Coupon = __decorate([
    (0, typeorm_1.Entity)('coupons')
], Coupon);
//# sourceMappingURL=coupon.entity.js.map