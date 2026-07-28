"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const payments_service_1 = require("./payments.service");
const payments_controller_1 = require("./payments.controller");
const moniepoint_provider_1 = require("./providers/moniepoint.provider");
const paystack_provider_1 = require("./providers/paystack.provider");
const stripe_provider_1 = require("./providers/stripe.provider");
const payment_entity_1 = require("./entities/payment.entity");
const order_entity_1 = require("../orders/entities/order.entity");
const terminal_entity_1 = require("../branches/entities/terminal.entity");
const refunds_module_1 = require("../refunds/refunds.module");
const agents_module_1 = require("../agents/agents.module");
const shipping_module_1 = require("../shipping/shipping.module");
const realtime_module_1 = require("../realtime/realtime.module");
let PaymentsModule = class PaymentsModule {
};
exports.PaymentsModule = PaymentsModule;
exports.PaymentsModule = PaymentsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([payment_entity_1.Payment, order_entity_1.Order, terminal_entity_1.Terminal]),
            (0, common_1.forwardRef)(() => refunds_module_1.RefundsModule),
            (0, common_1.forwardRef)(() => agents_module_1.AgentsModule),
            shipping_module_1.ShippingModule,
            realtime_module_1.RealtimeModule,
        ],
        controllers: [payments_controller_1.PaymentsController],
        providers: [payments_service_1.PaymentsService, moniepoint_provider_1.MoniepointProvider, paystack_provider_1.PaystackProvider, stripe_provider_1.StripeProvider],
        exports: [payments_service_1.PaymentsService, paystack_provider_1.PaystackProvider],
    })
], PaymentsModule);
//# sourceMappingURL=payments.module.js.map