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
exports.AccountController = void 0;
const common_1 = require("@nestjs/common");
const users_service_1 = require("./users.service");
const account_dto_1 = require("./dto/account.dto");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../shared/decorators/current-user.decorator");
const user_entity_1 = require("./entities/user.entity");
let AccountController = class AccountController {
    constructor(usersService) {
        this.usersService = usersService;
    }
    async getProfile(user) {
        const profile = await this.usersService.getProfile(user.id);
        return { data: profile };
    }
    async updateProfile(user, dto) {
        const profile = await this.usersService.updateProfile(user.id, dto);
        return { data: profile };
    }
    async changePassword(user, dto) {
        await this.usersService.changePassword(user.id, dto);
        return { message: 'Password changed successfully' };
    }
};
exports.AccountController = AccountController;
__decorate([
    (0, common_1.Get)('profile'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_entity_1.User]),
    __metadata("design:returntype", Promise)
], AccountController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Put)('profile'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_entity_1.User,
        account_dto_1.UpdateProfileDto]),
    __metadata("design:returntype", Promise)
], AccountController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.Post)('password'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_entity_1.User,
        account_dto_1.ChangePasswordDto]),
    __metadata("design:returntype", Promise)
], AccountController.prototype, "changePassword", null);
exports.AccountController = AccountController = __decorate([
    (0, common_1.Controller)({ path: 'account', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], AccountController);
//# sourceMappingURL=account.controller.js.map