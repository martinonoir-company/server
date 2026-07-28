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
exports.PushController = void 0;
const common_1 = require("@nestjs/common");
const push_service_1 = require("./push.service");
const push_dto_1 = require("./dto/push.dto");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../shared/decorators/current-user.decorator");
const user_entity_1 = require("../users/entities/user.entity");
let PushController = class PushController {
    constructor(pushService) {
        this.pushService = pushService;
    }
    async register(dto, user) {
        const token = await this.pushService.register(user.id, dto.expoPushToken, dto.platform, dto.deviceLabel);
        return {
            data: {
                id: token.id,
                platform: token.platform,
                deviceLabel: token.deviceLabel,
                isActive: token.isActive,
                createdAt: token.createdAt,
            },
        };
    }
    async unregister(dto, user) {
        await this.pushService.unregister(user.id, dto.expoPushToken);
        return { data: { unregistered: true } };
    }
};
exports.PushController = PushController;
__decorate([
    (0, common_1.Post)('register'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [push_dto_1.RegisterPushTokenDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], PushController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('unregister'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [push_dto_1.UnregisterPushTokenDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], PushController.prototype, "unregister", null);
exports.PushController = PushController = __decorate([
    (0, common_1.Controller)({ path: 'notifications/push', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [push_service_1.PushService])
], PushController);
//# sourceMappingURL=push.controller.js.map