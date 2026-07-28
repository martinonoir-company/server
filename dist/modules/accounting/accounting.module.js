"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountingModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const accounting_controller_1 = require("./accounting.controller");
const accounting_service_1 = require("./accounting.service");
const expense_entity_1 = require("./entities/expense.entity");
const accounting_audit_log_entity_1 = require("./entities/accounting-audit-log.entity");
const order_entity_1 = require("../orders/entities/order.entity");
const refund_request_entity_1 = require("../refunds/entities/refund-request.entity");
const agent_attribution_entity_1 = require("../agents/entities/agent-attribution.entity");
const agent_payout_entity_1 = require("../agents/entities/agent-payout.entity");
const marketing_agent_entity_1 = require("../agents/entities/marketing-agent.entity");
const user_entity_1 = require("../users/entities/user.entity");
let AccountingModule = class AccountingModule {
};
exports.AccountingModule = AccountingModule;
exports.AccountingModule = AccountingModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                expense_entity_1.Expense,
                accounting_audit_log_entity_1.AccountingAuditLog,
                order_entity_1.Order,
                refund_request_entity_1.RefundRequest,
                agent_attribution_entity_1.AgentAttribution,
                agent_payout_entity_1.AgentPayout,
                marketing_agent_entity_1.MarketingAgent,
                user_entity_1.User,
            ]),
        ],
        controllers: [accounting_controller_1.AccountingController],
        providers: [accounting_service_1.AccountingService],
        exports: [accounting_service_1.AccountingService],
    })
], AccountingModule);
//# sourceMappingURL=accounting.module.js.map