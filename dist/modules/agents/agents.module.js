"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const agents_controller_1 = require("./agents.controller");
const agents_service_1 = require("./agents.service");
const marketing_agent_entity_1 = require("./entities/marketing-agent.entity");
const agent_attribution_entity_1 = require("./entities/agent-attribution.entity");
const agent_payout_entity_1 = require("./entities/agent-payout.entity");
const user_entity_1 = require("../users/entities/user.entity");
const order_entity_1 = require("../orders/entities/order.entity");
const payments_module_1 = require("../payments/payments.module");
const auth_module_1 = require("../auth/auth.module");
let AgentsModule = class AgentsModule {
};
exports.AgentsModule = AgentsModule;
exports.AgentsModule = AgentsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                marketing_agent_entity_1.MarketingAgent,
                agent_attribution_entity_1.AgentAttribution,
                agent_payout_entity_1.AgentPayout,
                user_entity_1.User,
                order_entity_1.Order,
            ]),
            (0, common_1.forwardRef)(() => payments_module_1.PaymentsModule),
            auth_module_1.AuthModule,
        ],
        controllers: [agents_controller_1.AgentsController],
        providers: [agents_service_1.AgentsService],
        exports: [agents_service_1.AgentsService],
    })
], AgentsModule);
//# sourceMappingURL=agents.module.js.map