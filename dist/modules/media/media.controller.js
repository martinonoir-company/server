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
exports.MediaController = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const media_service_1 = require("./media.service");
const media_dto_1 = require("./dto/media.dto");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
class ReorderDto {
}
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(200),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], ReorderDto.prototype, "orderedIds", void 0);
let MediaController = class MediaController {
    constructor(media) {
        this.media = media;
    }
    async presign(dto) {
        const result = await this.media.presignUpload({
            filename: dto.filename,
            contentType: dto.contentType,
            size: dto.size,
            productId: dto.productId,
            categoryId: dto.categoryId,
        });
        return { data: result };
    }
    async confirm(dto) {
        const media = await this.media.confirmUpload({
            productId: dto.productId,
            variantId: dto.variantId ?? null,
            key: dto.key,
            altText: dto.altText,
            sortOrder: dto.sortOrder,
        });
        return { data: media };
    }
    async confirmCategory(dto) {
        const url = this.media.resolvePublicUrl(dto.key);
        return { data: { url } };
    }
    async reorder(productId, dto) {
        const media = await this.media.reorder(productId, dto.orderedIds);
        return { data: media };
    }
    async remove(id) {
        await this.media.deleteMedia(id);
    }
};
exports.MediaController = MediaController;
__decorate([
    (0, common_1.Post)('presign'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [media_dto_1.PresignUploadDto]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "presign", null);
__decorate([
    (0, common_1.Post)('confirm'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [media_dto_1.ConfirmUploadDto]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "confirm", null);
__decorate([
    (0, common_1.Post)('confirm-category'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [media_dto_1.ConfirmCategoryUploadDto]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "confirmCategory", null);
__decorate([
    (0, common_1.Patch)('product/:productId/reorder'),
    __param(0, (0, common_1.Param)('productId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, ReorderDto]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "reorder", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "remove", null);
exports.MediaController = MediaController = __decorate([
    (0, common_1.Controller)({ path: 'media', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [media_service_1.MediaService])
], MediaController);
//# sourceMappingURL=media.controller.js.map