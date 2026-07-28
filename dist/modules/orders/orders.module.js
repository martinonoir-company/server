"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const order_entity_1 = require("./entities/order.entity");
const product_entity_1 = require("../products/entities/product.entity");
const user_entity_1 = require("../users/entities/user.entity");
const orders_service_1 = require("./orders.service");
const orders_controller_1 = require("./orders.controller");
const pricing_engine_1 = require("./pricing.engine");
const inventory_module_1 = require("../inventory/inventory.module");
const coupons_module_1 = require("../coupons/coupons.module");
const shipping_module_1 = require("../shipping/shipping.module");
const cart_module_1 = require("../cart/cart.module");
const settings_module_1 = require("../settings/settings.module");
let OrdersModule = class OrdersModule {
};
exports.OrdersModule = OrdersModule;
exports.OrdersModule = OrdersModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([order_entity_1.Order, order_entity_1.OrderItem, order_entity_1.OrderStatusHistory, product_entity_1.Product, product_entity_1.ProductVariant, user_entity_1.User]),
            inventory_module_1.InventoryModule,
            coupons_module_1.CouponsModule,
            shipping_module_1.ShippingModule,
            cart_module_1.CartModule,
            settings_module_1.SettingsModule,
        ],
        controllers: [orders_controller_1.OrdersController],
        providers: [orders_service_1.OrdersService, pricing_engine_1.PricingEngine],
        exports: [orders_service_1.OrdersService, pricing_engine_1.PricingEngine],
    })
], OrdersModule);
//# sourceMappingURL=orders.module.js.map