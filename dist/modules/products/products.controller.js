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
exports.ProductsController = void 0;
const common_1 = require("@nestjs/common");
const products_service_1 = require("./products.service");
const product_dto_1 = require("./dto/product.dto");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
const public_decorator_1 = require("../../shared/decorators/public.decorator");
const require_permissions_decorator_1 = require("../../shared/decorators/require-permissions.decorator");
const role_entity_1 = require("../users/entities/role.entity");
let ProductsController = class ProductsController {
    constructor(productsService) {
        this.productsService = productsService;
    }
    async create(dto) {
        const product = await this.productsService.create(dto);
        return { data: product };
    }
    async bulkUpdate(dto) {
        const result = await this.productsService.bulkUpdate(dto);
        return { data: result };
    }
    async findAll(query) {
        const result = await this.productsService.findAll(query);
        return { data: result };
    }
    async findBySlug(slug) {
        const product = await this.productsService.findBySlug(slug);
        return { data: product };
    }
    async findVariantBySku(code) {
        const variant = await this.productsService.findVariantBySku(code);
        return { data: variant };
    }
    async findVariantByBarcode(code) {
        const variant = await this.productsService.findVariantByBarcode(code);
        return { data: variant };
    }
    async findOne(id, withDeleted) {
        const product = await this.productsService.findOne(id, {
            withDeleted: withDeleted === 'true' || withDeleted === '1',
        });
        return { data: product };
    }
    async update(id, dto) {
        const product = await this.productsService.update(id, dto);
        return { data: product };
    }
    async remove(id) {
        await this.productsService.remove(id);
    }
    async restore(id) {
        const product = await this.productsService.restore(id);
        return { data: product };
    }
    async addVariant(productId, dto) {
        const variant = await this.productsService.addVariantToProduct(productId, dto);
        return { data: variant };
    }
    async updateVariant(productId, variantId, dto) {
        const variant = await this.productsService.updateVariant(productId, variantId, dto);
        return { data: variant };
    }
    async deactivateVariant(productId, variantId) {
        const variant = await this.productsService.deactivateVariant(productId, variantId);
        return { data: variant };
    }
};
exports.ProductsController = ProductsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [product_dto_1.CreateProductDto]),
    __metadata("design:returntype", Promise)
], ProductsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('bulk'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [product_dto_1.BulkUpdateProductsDto]),
    __metadata("design:returntype", Promise)
], ProductsController.prototype, "bulkUpdate", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [product_dto_1.ProductQueryDto]),
    __metadata("design:returntype", Promise)
], ProductsController.prototype, "findAll", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('slug/:slug'),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProductsController.prototype, "findBySlug", null);
__decorate([
    (0, common_1.Get)('variants/by-sku/:code'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.PRODUCTS_READ),
    (0, common_1.Header)('Cache-Control', 'private, max-age=60'),
    __param(0, (0, common_1.Param)('code')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProductsController.prototype, "findVariantBySku", null);
__decorate([
    (0, common_1.Get)('variants/by-barcode/:code'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.PRODUCTS_READ),
    (0, common_1.Header)('Cache-Control', 'private, max-age=60'),
    __param(0, (0, common_1.Param)('code')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProductsController.prototype, "findVariantByBarcode", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('withDeleted')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ProductsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, product_dto_1.UpdateProductDto]),
    __metadata("design:returntype", Promise)
], ProductsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProductsController.prototype, "remove", null);
__decorate([
    (0, common_1.Patch)(':id/restore'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProductsController.prototype, "restore", null);
__decorate([
    (0, common_1.Post)(':productId/variants'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.PRODUCTS_UPDATE),
    __param(0, (0, common_1.Param)('productId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, product_dto_1.AddVariantDto]),
    __metadata("design:returntype", Promise)
], ProductsController.prototype, "addVariant", null);
__decorate([
    (0, common_1.Patch)(':productId/variants/:variantId'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.PRODUCTS_UPDATE),
    __param(0, (0, common_1.Param)('productId')),
    __param(1, (0, common_1.Param)('variantId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, product_dto_1.UpdateVariantDto]),
    __metadata("design:returntype", Promise)
], ProductsController.prototype, "updateVariant", null);
__decorate([
    (0, common_1.Delete)(':productId/variants/:variantId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.PRODUCTS_UPDATE),
    __param(0, (0, common_1.Param)('productId')),
    __param(1, (0, common_1.Param)('variantId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ProductsController.prototype, "deactivateVariant", null);
exports.ProductsController = ProductsController = __decorate([
    (0, common_1.Controller)({ path: 'products', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [products_service_1.ProductsService])
], ProductsController);
//# sourceMappingURL=products.controller.js.map