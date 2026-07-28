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
exports.AgentsController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const class_validator_1 = require("class-validator");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
const public_decorator_1 = require("../../shared/decorators/public.decorator");
const require_permissions_decorator_1 = require("../../shared/decorators/require-permissions.decorator");
const role_entity_1 = require("../users/entities/role.entity");
const current_user_decorator_1 = require("../../shared/decorators/current-user.decorator");
const user_entity_1 = require("../users/entities/user.entity");
const agents_service_1 = require("./agents.service");
const auth_service_1 = require("../auth/auth.service");
const auth_dto_1 = require("../auth/dto/auth.dto");
const paystack_provider_1 = require("../payments/providers/paystack.provider");
const AGENT_RESET_SCOPE = {
    roles: [user_entity_1.UserRole.MARKETING_AGENT],
    resetPath: '/agent/reset-password',
    portalLabel: 'Martino Noir agent account',
};
class AgentSignupDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(2, 100),
    __metadata("design:type", String)
], AgentSignupDto.prototype, "firstName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(2, 100),
    __metadata("design:type", String)
], AgentSignupDto.prototype, "lastName", void 0);
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], AgentSignupDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AgentSignupDto.prototype, "phone", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(8, 200),
    __metadata("design:type", String)
], AgentSignupDto.prototype, "password", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\d{2,10}$/),
    __metadata("design:type", String)
], AgentSignupDto.prototype, "bankCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\d{10}$/),
    __metadata("design:type", String)
], AgentSignupDto.prototype, "bankAccountNumber", void 0);
class AgentLoginDto {
}
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], AgentLoginDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AgentLoginDto.prototype, "password", void 0);
class ValidateAgentCodeDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(1, 16),
    __metadata("design:type", String)
], ValidateAgentCodeDto.prototype, "code", void 0);
class VerifyAgentBankAccountDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\d{10}$/),
    __metadata("design:type", String)
], VerifyAgentBankAccountDto.prototype, "accountNumber", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\d{2,10}$/),
    __metadata("design:type", String)
], VerifyAgentBankAccountDto.prototype, "bankCode", void 0);
class RejectAgentDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RejectAgentDto.prototype, "reason", void 0);
class SetAgentRateDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(10000),
    __metadata("design:type", Object)
], SetAgentRateDto.prototype, "bps", void 0);
class SetGlobalRateDto {
}
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(10000),
    __metadata("design:type", Number)
], SetGlobalRateDto.prototype, "bps", void 0);
let AgentsController = class AgentsController {
    constructor(agentsService, authService, paystack) {
        this.agentsService = agentsService;
        this.authService = authService;
        this.paystack = paystack;
    }
    async signup(dto) {
        const agent = await this.agentsService.createAgent({
            firstName: dto.firstName,
            lastName: dto.lastName,
            email: dto.email,
            phone: dto.phone,
            password: dto.password,
            bankCode: dto.bankCode,
            bankAccountNumber: dto.bankAccountNumber,
        });
        return {
            data: {
                id: agent.id,
                code: agent.code,
                status: agent.status,
                bankAccountName: agent.bankAccountName,
                message: 'Application submitted. You will be notified when the super admin reviews your account.',
            },
        };
    }
    async login(dto) {
        const { user } = await this.agentsService.authenticateForLogin(dto.email, dto.password);
        const tokens = await this.authService.generateTokenPair(user);
        return {
            data: {
                ...tokens,
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                },
            },
        };
    }
    async forgotPassword(dto) {
        await this.authService.forgotPassword(dto, AGENT_RESET_SCOPE);
        return {
            data: {
                message: 'If an agent account with that email exists, a reset link has been sent.',
            },
        };
    }
    async resetPassword(dto) {
        await this.authService.resetPassword(dto, {
            roles: AGENT_RESET_SCOPE.roles,
        });
        return {
            data: { message: 'Password reset successfully. Please sign in.' },
        };
    }
    async listBanks() {
        const banks = await this.paystack.listBanks();
        return { data: banks };
    }
    async verifyBankAccount(dto) {
        const res = await this.paystack.resolveBankAccount({
            accountNumber: dto.accountNumber,
            bankCode: dto.bankCode,
        });
        if ('error' in res) {
            return { data: { ok: false, error: res.error } };
        }
        return { data: { ok: true, accountName: res.accountName } };
    }
    async validateCode(dto) {
        const data = await this.agentsService.validateAgentCode(dto.code);
        return { data };
    }
    async myDashboard(user) {
        const agent = await this.agentsService.findByUserId(user.id);
        const data = await this.agentsService.dashboard(agent.id);
        return { data };
    }
    async myAttributions(user, page, limit) {
        const agent = await this.agentsService.findByUserId(user.id);
        const data = await this.agentsService.listAttributionsForAgent(agent.id, page ? parseInt(page, 10) || 1 : 1, limit ? parseInt(limit, 10) || 20 : 20);
        return { data };
    }
    async myPayouts(user, page, limit) {
        const agent = await this.agentsService.findByUserId(user.id);
        const data = await this.agentsService.listPayoutsForAgent(agent.id, page ? parseInt(page, 10) || 1 : 1, limit ? parseInt(limit, 10) || 20 : 20);
        return { data };
    }
    async list(page, limit, status, search) {
        const data = await this.agentsService.list({
            page: page ? parseInt(page, 10) || 1 : 1,
            limit: limit ? parseInt(limit, 10) || 20 : 20,
            status: status ? status : undefined,
            search: search || undefined,
        });
        return { data };
    }
    async getGlobalRate() {
        const bps = await this.agentsService.getGlobalRateBps();
        return { data: { bps } };
    }
    async setGlobalRate(dto, user) {
        const bps = await this.agentsService.setGlobalRateBps(dto.bps, user.id);
        return { data: { bps } };
    }
    async findOne(id) {
        const agent = await this.agentsService.findById(id);
        const data = await this.agentsService.dashboard(agent.id);
        return { data };
    }
    async attributionsForAgent(id, page, limit) {
        const data = await this.agentsService.listAttributionsForAgent(id, page ? parseInt(page, 10) || 1 : 1, limit ? parseInt(limit, 10) || 20 : 20);
        return { data };
    }
    async approve(id, user) {
        const data = await this.agentsService.approve(id, user.id);
        return { data };
    }
    async reject(id, dto, user) {
        const data = await this.agentsService.reject(id, user.id, dto.reason);
        return { data };
    }
    async suspend(id, dto, user) {
        const data = await this.agentsService.suspend(id, user.id, dto.reason);
        return { data };
    }
    async setAgentRate(id, dto) {
        const data = await this.agentsService.setAgentRateBps(id, dto.bps === undefined ? null : dto.bps);
        return { data };
    }
    async payout(id, user) {
        const data = await this.agentsService.initiatePayout(id, user.id);
        return { data };
    }
};
exports.AgentsController = AgentsController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('signup'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [AgentSignupDto]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "signup", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [AgentLoginDto]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "login", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('forgot-password'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({ default: { limit: 3, ttl: 600000 } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.ForgotPasswordDto]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "forgotPassword", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('reset-password'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 600000 } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.ResetPasswordDto]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "resetPassword", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('banks'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "listBanks", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('verify-bank-account'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [VerifyAgentBankAccountDto]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "verifyBankAccount", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('validate-code'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ValidateAgentCodeDto]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "validateCode", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.AGENT_SELF),
    (0, common_1.Get)('me/dashboard'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_entity_1.User]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "myDashboard", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.AGENT_SELF),
    (0, common_1.Get)('me/attributions'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_entity_1.User, String, String]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "myAttributions", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.AGENT_SELF),
    (0, common_1.Get)('me/payouts'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_entity_1.User, String, String]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "myPayouts", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.AGENTS_VIEW),
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "list", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.AGENTS_VIEW),
    (0, common_1.Get)('commission/global'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "getGlobalRate", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.AGENTS_COMMISSION_SET),
    (0, common_1.Post)('commission/global'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [SetGlobalRateDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "setGlobalRate", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.AGENTS_VIEW),
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "findOne", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.AGENTS_VIEW),
    (0, common_1.Get)(':id/attributions'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "attributionsForAgent", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.AGENTS_APPROVE),
    (0, common_1.Post)(':id/approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, user_entity_1.User]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "approve", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.AGENTS_APPROVE),
    (0, common_1.Post)(':id/reject'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, RejectAgentDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "reject", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.AGENTS_APPROVE),
    (0, common_1.Post)(':id/suspend'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, RejectAgentDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "suspend", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.AGENTS_COMMISSION_SET),
    (0, common_1.Post)(':id/commission'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, SetAgentRateDto]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "setAgentRate", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.AGENTS_PAYOUT),
    (0, common_1.Post)(':id/payout'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, user_entity_1.User]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "payout", null);
exports.AgentsController = AgentsController = __decorate([
    (0, common_1.Controller)({ path: 'agents', version: '1' }),
    __metadata("design:paramtypes", [agents_service_1.AgentsService,
        auth_service_1.AuthService,
        paystack_provider_1.PaystackProvider])
], AgentsController);
//# sourceMappingURL=agents.controller.js.map