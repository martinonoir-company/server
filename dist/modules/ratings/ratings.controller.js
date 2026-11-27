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
exports.RatingsController = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const ratings_service_1 = require("./ratings.service");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../shared/decorators/current-user.decorator");
const require_permissions_decorator_1 = require("../../shared/decorators/require-permissions.decorator");
const role_entity_1 = require("../users/entities/role.entity");
const user_entity_1 = require("../users/entities/user.entity");
class CreateRatingDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRatingDto.prototype, "orderId", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(5),
    __metadata("design:type", Number)
], CreateRatingDto.prototype, "stars", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], CreateRatingDto.prototype, "comment", void 0);
let RatingsController = class RatingsController {
    constructor(ratingsService) {
        this.ratingsService = ratingsService;
    }
    async list(page, limit, search) {
        const result = await this.ratingsService.findAllForAdmin({
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
            search,
        });
        return { data: result };
    }
    async getForOrder(user, orderId) {
        const rating = await this.ratingsService.findForUserOrder(user.id, orderId);
        return { data: rating };
    }
    async create(user, dto) {
        const rating = await this.ratingsService.upsert(user.id, dto.orderId, dto.stars, dto.comment);
        return { data: rating };
    }
};
exports.RatingsController = RatingsController;
__decorate([
    (0, common_1.Get)(),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.RATINGS_VIEW),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], RatingsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('order/:orderId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_entity_1.User, String]),
    __metadata("design:returntype", Promise)
], RatingsController.prototype, "getForOrder", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_entity_1.User, CreateRatingDto]),
    __metadata("design:returntype", Promise)
], RatingsController.prototype, "create", null);
exports.RatingsController = RatingsController = __decorate([
    (0, common_1.Controller)({ path: 'ratings', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [ratings_service_1.RatingsService])
], RatingsController);
//# sourceMappingURL=ratings.controller.js.map