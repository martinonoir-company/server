"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PosSessionsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const pos_sessions_controller_1 = require("./pos-sessions.controller");
const pos_sessions_service_1 = require("./pos-sessions.service");
const pos_session_entity_1 = require("./entities/pos-session.entity");
const branch_entity_1 = require("../branches/entities/branch.entity");
const terminal_entity_1 = require("../branches/entities/terminal.entity");
const user_branch_entity_1 = require("../branches/entities/user-branch.entity");
const product_entity_1 = require("../products/entities/product.entity");
const inventory_entity_1 = require("../inventory/entities/inventory.entity");
const pos_module_1 = require("../pos/pos.module");
const realtime_module_1 = require("../realtime/realtime.module");
let PosSessionsModule = class PosSessionsModule {
};
exports.PosSessionsModule = PosSessionsModule;
exports.PosSessionsModule = PosSessionsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                pos_session_entity_1.PosSession,
                terminal_entity_1.Terminal,
                branch_entity_1.Branch,
                user_branch_entity_1.UserBranch,
                product_entity_1.ProductVariant,
                product_entity_1.Product,
                product_entity_1.ProductMedia,
                inventory_entity_1.StockLevel,
            ]),
            pos_module_1.PosModule,
            realtime_module_1.RealtimeModule,
        ],
        controllers: [pos_sessions_controller_1.PosSessionsController],
        providers: [pos_sessions_service_1.PosSessionsService],
        exports: [pos_sessions_service_1.PosSessionsService],
    })
], PosSessionsModule);
//# sourceMappingURL=pos-sessions.module.js.map