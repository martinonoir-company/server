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
exports.PosSessionsController = void 0;
const common_1 = require("@nestjs/common");
const pos_sessions_service_1 = require("./pos-sessions.service");
const pos_session_dto_1 = require("./dto/pos-session.dto");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
const roles_guard_1 = require("../../shared/guards/roles.guard");
const require_permissions_decorator_1 = require("../../shared/decorators/require-permissions.decorator");
const current_user_decorator_1 = require("../../shared/decorators/current-user.decorator");
const role_entity_1 = require("../users/entities/role.entity");
const user_entity_1 = require("../users/entities/user.entity");
let PosSessionsController = class PosSessionsController {
    constructor(service) {
        this.service = service;
    }
    async open(terminalCode, dto, user) {
        const session = await this.service.open(terminalCode, { staffId: user.id, role: user.role }, dto.currency);
        return { data: session };
    }
    async getCurrent(terminalCode, user) {
        const session = await this.service.getCurrent(terminalCode, {
            staffId: user.id,
            role: user.role,
        });
        return { data: session };
    }
    async addItem(terminalCode, dto, user) {
        const session = await this.service.addItem(terminalCode, { staffId: user.id, role: user.role }, dto);
        return { data: session };
    }
    async updateItem(terminalCode, lineId, dto, user) {
        const session = await this.service.updateItem(terminalCode, { staffId: user.id, role: user.role }, lineId, dto);
        return { data: session };
    }
    async paymentIntent(terminalCode, dto, user) {
        const session = await this.service.paymentIntent(terminalCode, { staffId: user.id, role: user.role }, dto);
        return { data: session };
    }
    async confirm(terminalCode, dto, user) {
        const session = await this.service.confirm(terminalCode, { staffId: user.id, role: user.role }, dto);
        return { data: session };
    }
    async void(terminalCode, dto, user) {
        const session = await this.service.void(terminalCode, { staffId: user.id, role: user.role }, dto.version, dto.reason);
        return { data: session };
    }
};
exports.PosSessionsController = PosSessionsController;
__decorate([
    (0, common_1.Post)(':terminalCode/open'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('terminalCode')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, pos_session_dto_1.OpenSessionDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], PosSessionsController.prototype, "open", null);
__decorate([
    (0, common_1.Get)(':terminalCode'),
    __param(0, (0, common_1.Param)('terminalCode')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, user_entity_1.User]),
    __metadata("design:returntype", Promise)
], PosSessionsController.prototype, "getCurrent", null);
__decorate([
    (0, common_1.Post)(':terminalCode/items'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('terminalCode')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, pos_session_dto_1.AddSessionItemDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], PosSessionsController.prototype, "addItem", null);
__decorate([
    (0, common_1.Patch)(':terminalCode/items/:lineId'),
    __param(0, (0, common_1.Param)('terminalCode')),
    __param(1, (0, common_1.Param)('lineId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, pos_session_dto_1.UpdateSessionItemDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], PosSessionsController.prototype, "updateItem", null);
__decorate([
    (0, common_1.Post)(':terminalCode/payment-intent'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('terminalCode')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, pos_session_dto_1.PaymentIntentDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], PosSessionsController.prototype, "paymentIntent", null);
__decorate([
    (0, common_1.Post)(':terminalCode/confirm'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('terminalCode')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, pos_session_dto_1.ConfirmSessionDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], PosSessionsController.prototype, "confirm", null);
__decorate([
    (0, common_1.Post)(':terminalCode/void'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('terminalCode')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, pos_session_dto_1.VoidSessionDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], PosSessionsController.prototype, "void", null);
exports.PosSessionsController = PosSessionsController = __decorate([
    (0, common_1.Controller)({ path: 'pos-sessions', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.POS_SELL),
    __metadata("design:paramtypes", [pos_sessions_service_1.PosSessionsService])
], PosSessionsController);
//# sourceMappingURL=pos-sessions.controller.js.map