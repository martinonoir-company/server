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
exports.OrdersController = void 0;
const common_1 = require("@nestjs/common");
const orders_service_1 = require("./orders.service");
const order_dto_1 = require("./dto/order.dto");
const pricing_engine_1 = require("./pricing.engine");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../shared/decorators/current-user.decorator");
const public_decorator_1 = require("../../shared/decorators/public.decorator");
const require_permissions_decorator_1 = require("../../shared/decorators/require-permissions.decorator");
const role_entity_1 = require("../users/entities/role.entity");
const user_entity_1 = require("../users/entities/user.entity");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const coupon_entity_1 = require("../coupons/entities/coupon.entity");
const shipping_dispatch_service_1 = require("../shipping/shipping-dispatch.service");
class QuoteContextDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QuoteContextDto.prototype, "currency", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QuoteContextDto.prototype, "country", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QuoteContextDto.prototype, "state", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QuoteContextDto.prototype, "userId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QuoteContextDto.prototype, "couponCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QuoteContextDto.prototype, "shippingMethod", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(coupon_entity_1.CouponChannel),
    __metadata("design:type", String)
], QuoteContextDto.prototype, "channel", void 0);
class QuoteItemDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QuoteItemDto.prototype, "variantId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QuoteItemDto.prototype, "sku", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QuoteItemDto.prototype, "productName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QuoteItemDto.prototype, "variantName", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], QuoteItemDto.prototype, "quantity", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], QuoteItemDto.prototype, "unitPrice", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], QuoteItemDto.prototype, "compareAtPrice", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], QuoteItemDto.prototype, "weightKg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], QuoteItemDto.prototype, "options", void 0);
class QuoteRequestDto {
}
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => QuoteItemDto),
    __metadata("design:type", Array)
], QuoteRequestDto.prototype, "items", void 0);
__decorate([
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => QuoteContextDto),
    __metadata("design:type", QuoteContextDto)
], QuoteRequestDto.prototype, "context", void 0);
let OrdersController = class OrdersController {
    constructor(ordersService, pricingEngine, shippingDispatch) {
        this.ordersService = ordersService;
        this.pricingEngine = pricingEngine;
        this.shippingDispatch = shippingDispatch;
    }
    async quote(dto) {
        const result = await this.pricingEngine.quote(dto.items, dto.context);
        return { data: result };
    }
    async checkout(dto, user) {
        const order = await this.ordersService.checkout(dto, user?.id);
        return { data: order };
    }
    async findAll(query) {
        const result = await this.ordersService.findAll(query);
        return { data: result };
    }
    async dispatchQueue(query) {
        const result = await this.ordersService.findDispatchQueue(query);
        return { data: result };
    }
    async myOrders(user, query) {
        query.userId = user.id;
        const result = await this.ordersService.findAll(query);
        return { data: result };
    }
    async findOne(id) {
        const order = await this.ordersService.findOne(id);
        return { data: order };
    }
    async findByNumber(orderNumber) {
        const order = await this.ordersService.findByOrderNumber(orderNumber);
        return { data: order };
    }
    async shippingState(id) {
        const order = await this.ordersService.findOne(id);
        const progress = order.shippingOptOut
            ? 100
            : order.shippingTrackingId
                ? 100
                : order.shippingBookingId
                    ? 66
                    : order.shippingRetryCount > 0
                        ? 10
                        : 0;
        return {
            data: {
                orderId: order.id,
                orderNumber: order.orderNumber,
                optedOut: !!order.shippingOptOut,
                bookingId: order.shippingBookingId ?? null,
                trackingId: order.shippingTrackingId ?? null,
                labelUrl: order.shippingLabelUrl ?? null,
                status: order.shippingStatus ?? null,
                progress,
                lastError: order.shippingLastError ?? null,
                retryCount: order.shippingRetryCount,
            },
        };
    }
    async tracking(id) {
        const data = await this.shippingDispatch.getTracking(id);
        return { data };
    }
    async publicTracking(orderNumber, email) {
        if (!email || !email.trim()) {
            throw new common_1.BadRequestException('Email is required to track an order.');
        }
        const order = await this.ordersService.findByOrderNumberAndEmail(orderNumber, email);
        const data = await this.shippingDispatch.getTracking(order.id);
        return {
            data: {
                orderNumber: order.orderNumber,
                status: data.status,
                description: data.description,
                etaDays: data.etaDays,
                etaDate: data.etaDate,
                events: data.events,
                trackingNumber: data.trackingNumber,
                optedOut: data.optedOut,
                pending: data.pending,
            },
        };
    }
    async updateStatus(id, dto, user) {
        const order = await this.ordersService.transitionStatus(id, dto, user?.id);
        return { data: order };
    }
    async dispatch(id, dto, user) {
        const order = await this.ordersService.dispatchOrder(id, dto, user?.id);
        return { data: order };
    }
    async dispatchScan(ref, dto, user) {
        const order = await this.ordersService.markDispatchedByScan(ref, user?.id, dto?.note);
        return { data: order };
    }
    async markDelivered(id, dto, user) {
        const order = await this.ordersService.markDelivered(id, dto, user?.id);
        return { data: order };
    }
};
exports.OrdersController = OrdersController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('quote'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [QuoteRequestDto]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "quote", null);
__decorate([
    (0, common_1.Post)('checkout'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [order_dto_1.CreateOrderDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "checkout", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [order_dto_1.OrderQueryDto]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('dispatch-queue'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.ORDERS_READ),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [order_dto_1.OrderQueryDto]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "dispatchQueue", null);
__decorate([
    (0, common_1.Get)('mine'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_entity_1.User,
        order_dto_1.OrderQueryDto]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "myOrders", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)('number/:orderNumber'),
    __param(0, (0, common_1.Param)('orderNumber')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "findByNumber", null);
__decorate([
    (0, common_1.Get)(':id/shipping'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "shippingState", null);
__decorate([
    (0, common_1.Get)(':id/tracking'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "tracking", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('public/track/:orderNumber'),
    __param(0, (0, common_1.Param)('orderNumber')),
    __param(1, (0, common_1.Query)('email')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "publicTracking", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.ORDERS_UPDATE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, order_dto_1.UpdateOrderStatusDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Post)(':id/dispatch'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.ORDERS_UPDATE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, order_dto_1.DispatchOrderDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "dispatch", null);
__decorate([
    (0, common_1.Post)('dispatch-scan/:ref'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.ORDERS_UPDATE),
    __param(0, (0, common_1.Param)('ref')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, order_dto_1.DispatchScanDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "dispatchScan", null);
__decorate([
    (0, common_1.Post)(':id/delivered'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.ORDERS_UPDATE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, order_dto_1.MarkDeliveredDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "markDelivered", null);
exports.OrdersController = OrdersController = __decorate([
    (0, common_1.Controller)({ path: 'orders', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [orders_service_1.OrdersService,
        pricing_engine_1.PricingEngine,
        shipping_dispatch_service_1.ShippingDispatchService])
], OrdersController);
//# sourceMappingURL=orders.controller.js.map