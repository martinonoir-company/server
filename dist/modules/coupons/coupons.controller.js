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
exports.CouponsController = void 0;
const common_1 = require("@nestjs/common");
const coupons_service_1 = require("./coupons.service");
const coupon_dto_1 = require("./dto/coupon.dto");
const coupon_entity_1 = require("./entities/coupon.entity");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
const public_decorator_1 = require("../../shared/decorators/public.decorator");
const require_permissions_decorator_1 = require("../../shared/decorators/require-permissions.decorator");
const role_entity_1 = require("../users/entities/role.entity");
let CouponsController = class CouponsController {
    constructor(couponsService) {
        this.couponsService = couponsService;
    }
    async findAll(page, limit, status, search) {
        const result = await this.couponsService.findAll({
            page: page ? parseInt(page, 10) || 1 : 1,
            limit: limit ? parseInt(limit, 10) || 20 : 20,
            status: status ? status : undefined,
            search: search || undefined,
        });
        return { data: result };
    }
    async findOne(id) {
        const coupon = await this.couponsService.findById(id);
        return { data: coupon };
    }
    async create(dto, req) {
        const coupon = await this.couponsService.create({
            ...this.toEntityShape(dto),
            createdBy: req.user?.id ?? req.user?.sub,
        });
        return { data: coupon };
    }
    async update(id, dto) {
        const coupon = await this.couponsService.update(id, this.toEntityShape(dto));
        return { data: coupon };
    }
    async setStatus(id, status) {
        const coupon = await this.couponsService.update(id, { status });
        return { data: coupon };
    }
    async remove(id) {
        await this.couponsService.remove(id);
    }
    async findAutoApply(variantIds, currency, channel) {
        const ids = Array.isArray(variantIds)
            ? variantIds
            : variantIds
                ? variantIds.split(',').filter(Boolean)
                : [];
        if (ids.length === 0)
            return { data: [] };
        const cur = (currency ?? 'NGN').toUpperCase();
        const ch = channel
            ? channel.toUpperCase()
            : undefined;
        const items = await this.couponsService.findAutoApplyCandidates(ids, cur, ch);
        return {
            data: items.map((c) => ({
                id: c.id,
                code: c.code,
                description: c.description,
                discountType: c.discountType,
                discountValue: Number(c.discountValue),
                currency: c.currency,
                minimumOrderAmount: Number(c.minimumOrderAmount),
                maximumDiscount: Number(c.maximumDiscount),
                applicableVariantIds: c.applicableVariantIds,
                autoApply: c.autoApply,
            })),
        };
    }
    async findActivePromotions(variantIds, currency, channel) {
        const ids = Array.isArray(variantIds)
            ? variantIds
            : variantIds
                ? variantIds.split(',').filter(Boolean)
                : [];
        if (ids.length === 0)
            return { data: [] };
        const cur = (currency ?? 'NGN').toUpperCase();
        const ch = channel
            ? channel.toUpperCase()
            : undefined;
        const data = await this.couponsService.findVariantPromotions(ids, cur, ch);
        return { data };
    }
    toEntityShape(dto) {
        const { startsAt, expiresAt, ...rest } = dto;
        const out = { ...rest };
        if (startsAt !== undefined) {
            out.startsAt = startsAt ? new Date(startsAt) : undefined;
        }
        if (expiresAt !== undefined) {
            out.expiresAt = expiresAt ? new Date(expiresAt) : undefined;
        }
        return out;
    }
};
exports.CouponsController = CouponsController;
__decorate([
    (0, common_1.Get)(),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.COUPONS_READ),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], CouponsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.COUPONS_READ),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CouponsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.COUPONS_CREATE),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [coupon_dto_1.CreateCouponDto, Object]),
    __metadata("design:returntype", Promise)
], CouponsController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.COUPONS_UPDATE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, coupon_dto_1.UpdateCouponDto]),
    __metadata("design:returntype", Promise)
], CouponsController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.COUPONS_UPDATE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CouponsController.prototype, "setStatus", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.COUPONS_DELETE),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CouponsController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('auto-apply/search'),
    __param(0, (0, common_1.Query)('variantIds')),
    __param(1, (0, common_1.Query)('currency')),
    __param(2, (0, common_1.Query)('channel')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], CouponsController.prototype, "findAutoApply", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('promotions/active'),
    __param(0, (0, common_1.Query)('variantIds')),
    __param(1, (0, common_1.Query)('currency')),
    __param(2, (0, common_1.Query)('channel')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], CouponsController.prototype, "findActivePromotions", null);
exports.CouponsController = CouponsController = __decorate([
    (0, common_1.Controller)({ path: 'coupons', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [coupons_service_1.CouponsService])
], CouponsController);
//# sourceMappingURL=coupons.controller.js.map