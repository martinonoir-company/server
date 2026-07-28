"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PosModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const pos_sync_controller_1 = require("./pos-sync.controller");
const pos_pages_controller_1 = require("./pos-pages.controller");
const pos_sync_service_1 = require("./pos-sync.service");
const pos_sync_worker_service_1 = require("./pos-sync-worker.service");
const pos_sync_job_entity_1 = require("./entities/pos-sync-job.entity");
const inventory_module_1 = require("../inventory/inventory.module");
const payments_module_1 = require("../payments/payments.module");
const coupons_module_1 = require("../coupons/coupons.module");
const order_entity_1 = require("../orders/entities/order.entity");
const product_entity_1 = require("../products/entities/product.entity");
const coupon_entity_1 = require("../coupons/entities/coupon.entity");
const customer_entity_1 = require("../customers/entities/customer.entity");
const customers_service_1 = require("../customers/customers.service");
const inventory_entity_1 = require("../inventory/entities/inventory.entity");
let PosModule = class PosModule {
};
exports.PosModule = PosModule;
exports.PosModule = PosModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                pos_sync_job_entity_1.PosSyncJob,
                order_entity_1.Order, order_entity_1.OrderItem, order_entity_1.OrderStatusHistory,
                product_entity_1.ProductVariant, product_entity_1.Product,
                coupon_entity_1.Coupon,
                customer_entity_1.Customer, customer_entity_1.CustomerAddress,
                inventory_entity_1.StockLevel,
            ]),
            inventory_module_1.InventoryModule,
            payments_module_1.PaymentsModule,
            coupons_module_1.CouponsModule,
        ],
        controllers: [pos_sync_controller_1.PosSyncController, pos_pages_controller_1.PosPagesController],
        providers: [pos_sync_service_1.PosSyncService, pos_sync_worker_service_1.PosSyncWorkerService, customers_service_1.CustomersService],
        exports: [pos_sync_service_1.PosSyncService],
    })
], PosModule);
//# sourceMappingURL=pos.module.js.map