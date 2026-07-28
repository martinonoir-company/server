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
exports.WishlistService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const wishlist_entity_1 = require("./entities/wishlist.entity");
let WishlistService = class WishlistService {
    constructor(wishlistRepo) {
        this.wishlistRepo = wishlistRepo;
    }
    async addItem(userId, productId, variantId, note) {
        const existing = await this.wishlistRepo.findOne({
            where: { userId, productId },
        });
        if (existing) {
            if (variantId !== undefined)
                existing.variantId = variantId;
            if (note !== undefined)
                existing.note = note;
            return this.wishlistRepo.save(existing);
        }
        const item = this.wishlistRepo.create({ userId, productId, variantId, note });
        return this.wishlistRepo.save(item);
    }
    async removeItem(userId, productId) {
        const item = await this.wishlistRepo.findOne({ where: { userId, productId } });
        if (!item) {
            throw new common_1.NotFoundException('Item not in wishlist');
        }
        await this.wishlistRepo.remove(item);
    }
    async getUserWishlist(userId) {
        return this.wishlistRepo.find({
            where: { userId },
            relations: ['product', 'product.variants', 'product.media', 'product.category', 'variant'],
            order: { createdAt: 'DESC' },
        });
    }
    async isWishlisted(userId, productId) {
        const count = await this.wishlistRepo.count({ where: { userId, productId } });
        return count > 0;
    }
    async getWishlistedProductIds(userId, productIds) {
        if (productIds.length === 0)
            return [];
        const items = await this.wishlistRepo
            .createQueryBuilder('w')
            .select('w.productId')
            .where('w.userId = :userId', { userId })
            .andWhere('w.productId IN (:...productIds)', { productIds })
            .getMany();
        return items.map((i) => i.productId);
    }
    async getCount(userId) {
        return this.wishlistRepo.count({ where: { userId } });
    }
    async clearWishlist(userId) {
        await this.wishlistRepo.delete({ userId });
    }
};
exports.WishlistService = WishlistService;
exports.WishlistService = WishlistService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(wishlist_entity_1.WishlistItem)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], WishlistService);
//# sourceMappingURL=wishlist.service.js.map