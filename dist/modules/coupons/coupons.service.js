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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CouponsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const coupon_entity_1 = require("./entities/coupon.entity");
const product_entity_1 = require("../products/entities/product.entity");
let CouponsService = class CouponsService {
    constructor(couponRepo, variantRepo) {
        this.couponRepo = couponRepo;
        this.variantRepo = variantRepo;
    }
    async create(data) {
        if (data.code)
            data.code = data.code.toUpperCase().trim();
        const existing = await this.couponRepo.findOne({ where: { code: data.code } });
        if (existing)
            throw new common_1.BadRequestException(`Coupon code "${data.code}" already exists`);
        await this.expandProductScopeToVariants(data);
        const coupon = this.couponRepo.create(data);
        return this.couponRepo.save(coupon);
    }
    async expandProductScopeToVariants(data) {
        const productIds = data.applicableProductIds ?? [];
        if (productIds.length === 0)
            return;
        const variants = await this.variantRepo.find({
            where: { productId: (0, typeorm_2.In)(productIds), isActive: true },
            select: { id: true },
        });
        const fromProducts = variants.map((v) => v.id);
        const explicit = data.applicableVariantIds ?? [];
        data.applicableVariantIds = Array.from(new Set([...explicit, ...fromProducts]));
    }
    async findByCode(code) {
        const coupon = await this.couponRepo.findOne({
            where: { code: code.toUpperCase().trim() },
        });
        if (!coupon)
            throw new common_1.NotFoundException(`Coupon "${code}" not found`);
        return coupon;
    }
    async findById(id) {
        const coupon = await this.couponRepo.findOne({ where: { id } });
        if (!coupon)
            throw new common_1.NotFoundException(`Coupon ${id} not found`);
        return coupon;
    }
    async applyCoupon(code, subtotal, currency, _userId, channel) {
        const coupon = await this.findByCode(code);
        if (!coupon.isValid) {
            return { valid: false, code: coupon.code, discountType: coupon.discountType, discountAmount: 0, message: 'Coupon is no longer valid' };
        }
        if (channel &&
            Array.isArray(coupon.applicableChannels) &&
            coupon.applicableChannels.length > 0 &&
            !coupon.applicableChannels.includes(channel)) {
            return { valid: false, code: coupon.code, discountType: coupon.discountType, discountAmount: 0, message: 'Coupon is not valid on this channel' };
        }
        if (coupon.discountType === coupon_entity_1.DiscountType.FIXED_AMOUNT && coupon.currency && coupon.currency !== currency) {
            return { valid: false, code: coupon.code, discountType: coupon.discountType, discountAmount: 0, message: `Coupon is only valid for ${coupon.currency} orders` };
        }
        if (subtotal < coupon.minimumOrderAmount) {
            return { valid: false, code: coupon.code, discountType: coupon.discountType, discountAmount: 0, message: `Minimum order amount not met` };
        }
        let discountAmount = 0;
        switch (coupon.discountType) {
            case coupon_entity_1.DiscountType.PERCENTAGE:
                discountAmount = Math.floor((subtotal * Number(coupon.discountValue)) / 100);
                if (coupon.maximumDiscount > 0) {
                    discountAmount = Math.min(discountAmount, Number(coupon.maximumDiscount));
                }
                break;
            case coupon_entity_1.DiscountType.FIXED_AMOUNT:
                discountAmount = Math.min(Number(coupon.discountValue), subtotal);
                break;
            case coupon_entity_1.DiscountType.FREE_SHIPPING:
                discountAmount = 0;
                break;
        }
        return {
            valid: true,
            code: coupon.code,
            discountType: coupon.discountType,
            discountAmount,
        };
    }
    async findAutoApplyCandidates(variantIds, currency, channel) {
        if (variantIds.length === 0)
            return [];
        const qb = this.couponRepo
            .createQueryBuilder('c')
            .where('c."autoApply" = true')
            .andWhere(`c.status = :st`, { st: coupon_entity_1.CouponStatus.ACTIVE })
            .andWhere(`jsonb_array_length(c."applicableVariantIds") > 0`)
            .andWhere(`jsonb_exists_any(c."applicableVariantIds", ARRAY[:...variantIds]::text[])`, { variantIds });
        if (channel) {
            qb.andWhere(`(jsonb_array_length(c."applicableChannels") = 0 OR jsonb_exists(c."applicableChannels", :ch))`, { ch: channel });
        }
        qb.andWhere(`(c."discountType" = :pct OR c.currency = :cur)`, { pct: coupon_entity_1.DiscountType.PERCENTAGE, cur: currency });
        const now = new Date();
        qb.andWhere(`(c."startsAt" IS NULL OR c."startsAt" <= :now)`, { now });
        qb.andWhere(`(c."expiresAt" IS NULL OR c."expiresAt" >= :now)`, { now });
        return qb.getMany();
    }
    async findVariantPromotions(variantIds, currency, channel) {
        const candidates = (await this.findAutoApplyCandidates(variantIds, currency, channel)).filter((c) => c.isValid);
        if (candidates.length === 0)
            return [];
        const variants = await this.variantRepo.find({
            where: { id: (0, typeorm_2.In)(variantIds) },
            select: { id: true, retailPriceNgn: true, retailPriceUsd: true },
        });
        const priceOf = (variantId) => {
            const v = variants.find((x) => x.id === variantId);
            if (!v)
                return 0;
            return Number(currency === 'USD' ? v.retailPriceUsd : v.retailPriceNgn);
        };
        const discountFor = (c, price) => {
            if (price <= 0)
                return 0;
            if (c.discountType === coupon_entity_1.DiscountType.PERCENTAGE) {
                let d = Math.floor((price * Number(c.discountValue)) / 100);
                const cap = Number(c.maximumDiscount);
                if (cap > 0 && d > cap)
                    d = cap;
                return d;
            }
            if (c.discountType === coupon_entity_1.DiscountType.FIXED_AMOUNT) {
                return Math.min(Number(c.discountValue), price);
            }
            return 0;
        };
        const best = new Map();
        for (const c of candidates) {
            if (c.discountType === coupon_entity_1.DiscountType.FREE_SHIPPING)
                continue;
            for (const vId of c.applicableVariantIds) {
                if (!variantIds.includes(vId))
                    continue;
                const amount = discountFor(c, priceOf(vId));
                if (amount <= 0)
                    continue;
                const prev = best.get(vId);
                if (!prev || amount > prev.amount) {
                    best.set(vId, {
                        amount,
                        discountType: c.discountType,
                        discountValue: Number(c.discountValue),
                        currency: c.currency ?? null,
                    });
                }
            }
        }
        return Array.from(best.entries()).map(([variantId, v]) => ({
            variantId,
            discountType: v.discountType,
            discountValue: v.discountValue,
            currency: v.currency,
        }));
    }
    async resolveAutoApplyForLines(lines, currency, channel) {
        const variantIds = lines.map((l) => l.variantId);
        const candidates = await this.findAutoApplyCandidates(variantIds, currency, channel);
        if (candidates.length === 0)
            return null;
        let best = null;
        for (const c of candidates) {
            if (!c.isValid)
                continue;
            const perLine = this.computeAutoApplyPerLine(lines, c);
            const totalDiscount = Array.from(perLine.values()).reduce((s, n) => s + n, 0);
            if (totalDiscount > (best?.totalDiscount ?? 0)) {
                best = { coupon: c, perLine, totalDiscount };
            }
        }
        return best;
    }
    computeAutoApplyPerLine(lines, coupon) {
        const out = new Map();
        const covered = lines.filter((l) => coupon.applicableVariantIds.includes(l.variantId));
        if (covered.length === 0)
            return out;
        const coveredSubtotal = covered.reduce((s, l) => s + l.lineSubtotal, 0);
        if (coveredSubtotal <= 0)
            return out;
        if (Number(coupon.minimumOrderAmount) > 0 &&
            coveredSubtotal < Number(coupon.minimumOrderAmount)) {
            return out;
        }
        if (coupon.discountType === coupon_entity_1.DiscountType.PERCENTAGE) {
            const pct = Number(coupon.discountValue);
            let totalDiscount = 0;
            for (const line of covered) {
                const d = Math.floor((line.lineSubtotal * pct) / 100);
                if (d > 0) {
                    out.set(line.variantId, d);
                    totalDiscount += d;
                }
            }
            const cap = Number(coupon.maximumDiscount);
            if (cap > 0 && totalDiscount > cap) {
                const ratio = cap / totalDiscount;
                let runningSum = 0;
                let largestId = null;
                let largest = 0;
                for (const line of covered) {
                    const before = out.get(line.variantId) ?? 0;
                    const scaled = Math.floor(before * ratio);
                    out.set(line.variantId, scaled);
                    runningSum += scaled;
                    if (scaled > largest) {
                        largest = scaled;
                        largestId = line.variantId;
                    }
                }
                const residual = cap - runningSum;
                if (residual > 0 && largestId) {
                    out.set(largestId, (out.get(largestId) ?? 0) + residual);
                }
            }
            return out;
        }
        if (coupon.discountType === coupon_entity_1.DiscountType.FIXED_AMOUNT) {
            const fixed = Math.min(Number(coupon.discountValue), coveredSubtotal);
            if (fixed <= 0)
                return out;
            let runningSum = 0;
            let largestId = null;
            let largest = 0;
            for (const line of covered) {
                const share = Math.floor((fixed * line.lineSubtotal) / coveredSubtotal);
                out.set(line.variantId, share);
                runningSum += share;
                if (line.lineSubtotal > largest) {
                    largest = line.lineSubtotal;
                    largestId = line.variantId;
                }
            }
            const residual = fixed - runningSum;
            if (residual > 0 && largestId) {
                out.set(largestId, (out.get(largestId) ?? 0) + residual);
            }
            return out;
        }
        return out;
    }
    async recordUsage(code) {
        await this.couponRepo.increment({ code: code.toUpperCase() }, 'timesUsed', 1);
    }
    async findAll(opts = {}) {
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
            qb.andWhere('(LOWER(c.code) LIKE :term OR LOWER(c.description) LIKE :term)', { term });
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
    async update(id, data) {
        const coupon = await this.findById(id);
        delete data.code;
        if (data.applicableProductIds !== undefined ||
            data.applicableVariantIds !== undefined) {
            data.applicableProductIds =
                data.applicableProductIds ?? coupon.applicableProductIds;
            await this.expandProductScopeToVariants(data);
        }
        Object.assign(coupon, data);
        return this.couponRepo.save(coupon);
    }
    async remove(id) {
        const coupon = await this.findById(id);
        await this.couponRepo.softRemove(coupon);
    }
    async disable(id) {
        const coupon = await this.findById(id);
        coupon.status = coupon_entity_1.CouponStatus.DISABLED;
        return this.couponRepo.save(coupon);
    }
};
exports.CouponsService = CouponsService;
exports.CouponsService = CouponsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(coupon_entity_1.Coupon)),
    __param(1, (0, typeorm_1.InjectRepository)(product_entity_1.ProductVariant)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], CouponsService);
//# sourceMappingURL=coupons.service.js.map