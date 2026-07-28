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
exports.ShippingController = void 0;
const common_1 = require("@nestjs/common");
const shipping_service_1 = require("./shipping.service");
const gig_logistics_service_1 = require("./gig-logistics.service");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
const public_decorator_1 = require("../../shared/decorators/public.decorator");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class ShippingRateDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ShippingRateDto.prototype, "country", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ShippingRateDto.prototype, "state", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ShippingRateDto.prototype, "weightKg", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ShippingRateDto.prototype, "currency", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ShippingRateDto.prototype, "subtotal", void 0);
class AddressDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddressDto.prototype, "firstName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddressDto.prototype, "lastName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddressDto.prototype, "line1", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddressDto.prototype, "line2", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddressDto.prototype, "city", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddressDto.prototype, "state", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddressDto.prototype, "country", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddressDto.prototype, "phone", void 0);
class CreateShipmentDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateShipmentDto.prototype, "orderId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateShipmentDto.prototype, "orderNumber", void 0);
__decorate([
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => AddressDto),
    __metadata("design:type", AddressDto)
], CreateShipmentDto.prototype, "recipientAddress", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateShipmentDto.prototype, "weightKg", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateShipmentDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateShipmentDto.prototype, "value", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateShipmentDto.prototype, "currency", void 0);
let ShippingController = class ShippingController {
    constructor(shippingService, gigLogistics) {
        this.shippingService = shippingService;
        this.gigLogistics = gigLogistics;
    }
    async calculateRates(dto) {
        const rates = await this.shippingService.calculateRates(dto);
        return { data: rates };
    }
    async createShipment(dto) {
        const result = await this.gigLogistics.createShipment({
            orderId: dto.orderId,
            orderNumber: dto.orderNumber,
            senderAddress: {
                line1: '12 Warehouse Road, Ikeja',
                city: 'Lagos',
                state: 'Lagos',
                country: 'NG',
            },
            recipientAddress: dto.recipientAddress,
            packageDetails: {
                weightKg: dto.weightKg,
                description: dto.description,
                value: dto.value,
                currency: dto.currency,
            },
        });
        return { data: result };
    }
    async trackShipment(trackingNumber) {
        const result = await this.gigLogistics.trackShipment(trackingNumber);
        return { data: result };
    }
};
exports.ShippingController = ShippingController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('rates'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ShippingRateDto]),
    __metadata("design:returntype", Promise)
], ShippingController.prototype, "calculateRates", null);
__decorate([
    (0, common_1.Post)('shipments'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateShipmentDto]),
    __metadata("design:returntype", Promise)
], ShippingController.prototype, "createShipment", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('track/:trackingNumber'),
    __param(0, (0, common_1.Param)('trackingNumber')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ShippingController.prototype, "trackShipment", null);
exports.ShippingController = ShippingController = __decorate([
    (0, common_1.Controller)({ path: 'shipping', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [shipping_service_1.ShippingService,
        gig_logistics_service_1.GigLogisticsService])
], ShippingController);
//# sourceMappingURL=shipping.controller.js.map