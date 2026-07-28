"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefundsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const refunds_controller_1 = require("./refunds.controller");
const refunds_service_1 = require("./refunds.service");
const refund_request_entity_1 = require("./entities/refund-request.entity");
const order_entity_1 = require("../orders/entities/order.entity");
const payment_entity_1 = require("../payments/entities/payment.entity");
const inventory_entity_1 = require("../inventory/entities/inventory.entity");
const inventory_module_1 = require("../inventory/inventory.module");
const payments_module_1 = require("../payments/payments.module");
const agents_module_1 = require("../agents/agents.module");
let RefundsModule = class RefundsModule {
};
exports.RefundsModule = RefundsModule;
exports.RefundsModule = RefundsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                refund_request_entity_1.RefundRequest,
                refund_request_entity_1.RefundRequestItem,
                order_entity_1.Order,
                order_entity_1.OrderItem,
                payment_entity_1.Payment,
                inventory_entity_1.StockMovement,
            ]),
            inventory_module_1.InventoryModule,
            (0, common_1.forwardRef)(() => payments_module_1.PaymentsModule),
            (0, common_1.forwardRef)(() => agents_module_1.AgentsModule),
        ],
        controllers: [refunds_controller_1.RefundsController],
        providers: [refunds_service_1.RefundsService],
        exports: [refunds_service_1.RefundsService],
    })
], RefundsModule);
//# sourceMappingURL=refunds.module.js.map