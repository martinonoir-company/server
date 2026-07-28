"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShippingModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const shipping_service_1 = require("./shipping.service");
const shipping_controller_1 = require("./shipping.controller");
const gig_logistics_service_1 = require("./gig-logistics.service");
const aaj_provider_1 = require("./aaj.provider");
const shipping_dispatch_service_1 = require("./shipping-dispatch.service");
const order_entity_1 = require("../orders/entities/order.entity");
const branch_entity_1 = require("../branches/entities/branch.entity");
const user_entity_1 = require("../users/entities/user.entity");
let ShippingModule = class ShippingModule {
};
exports.ShippingModule = ShippingModule;
exports.ShippingModule = ShippingModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([order_entity_1.Order, branch_entity_1.Branch, user_entity_1.User])],
        controllers: [shipping_controller_1.ShippingController],
        providers: [
            aaj_provider_1.AajProvider,
            shipping_service_1.ShippingService,
            gig_logistics_service_1.GigLogisticsService,
            shipping_dispatch_service_1.ShippingDispatchService,
        ],
        exports: [
            aaj_provider_1.AajProvider,
            shipping_service_1.ShippingService,
            gig_logistics_service_1.GigLogisticsService,
            shipping_dispatch_service_1.ShippingDispatchService,
        ],
    })
], ShippingModule);
//# sourceMappingURL=shipping.module.js.map