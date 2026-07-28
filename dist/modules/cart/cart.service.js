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
exports.CartService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const cart_entity_1 = require("./entities/cart.entity");
const product_entity_1 = require("../products/entities/product.entity");
let CartService = class CartService {
    constructor(cartRepo, variantRepo, productRepo, mediaRepo, dataSource) {
        this.cartRepo = cartRepo;
        this.variantRepo = variantRepo;
        this.productRepo = productRepo;
        this.mediaRepo = mediaRepo;
        this.dataSource = dataSource;
    }
    async getCart(userId) {
        const rows = await this.cartRepo.find({
            where: { userId },
            order: { createdAt: 'ASC' },
        });
        if (rows.length === 0)
            return [];
        const variantIds = rows
            .map((r) => r.variantId)
            .filter((v) => typeof v === 'string' && v.length > 0);
        const liveVariants = variantIds.length
            ? await this.variantRepo.find({
                where: { id: (0, typeorm_2.In)(variantIds) },
            })
            : [];
        const byVariantId = new Map(liveVariants.map((v) => [v.id, v]));
        const productIds = Array.from(new Set(liveVariants.map((v) => v.productId).filter(Boolean)));
        const liveProducts = productIds.length
            ? await this.productRepo.find({ where: { id: (0, typeorm_2.In)(productIds) } })
            : [];
        const byProductId = new Map(liveProducts.map((p) => [p.id, p]));
        return rows.map((row) => this.toView(row, byVariantId, byProductId));
    }
    async getCount(userId) {
        const { sum } = await this.cartRepo
            .createQueryBuilder('c')
            .select('COALESCE(SUM(c.quantity), 0)', 'sum')
            .where('c.userId = :userId', { userId })
            .getRawOne() ?? { sum: '0' };
        return Number(sum ?? 0);
    }
    async addItem(userId, variantId, quantity, isWholesale = false) {
        if (!Number.isInteger(quantity) || quantity < 1) {
            throw new common_1.BadRequestException('quantity must be a positive integer');
        }
        const { variant, product, imageUrl } = await this.loadVariantOrThrow(variantId);
        const saved = await this.dataSource.transaction(async (manager) => {
            const repo = manager.getRepository(cart_entity_1.CartItem);
            const existing = await repo.findOne({
                where: { userId, variantId, isWholesale },
            });
            if (existing) {
                existing.quantity = existing.quantity + quantity;
                existing.productName = product.name;
                existing.productSlug = product.slug;
                existing.variantName = variant.name ?? null;
                existing.sku = variant.sku;
                existing.priceNgn = Number(variant.retailPriceNgn);
                existing.priceUsd = Number(variant.retailPriceUsd);
                existing.options = variant.options ?? null;
                existing.imageUrl = imageUrl;
                existing.productId = product.id;
                return repo.save(existing);
            }
            const fresh = repo.create({
                userId,
                variantId,
                productId: product.id,
                quantity,
                productName: product.name,
                productSlug: product.slug,
                variantName: variant.name ?? null,
                sku: variant.sku,
                priceNgn: Number(variant.retailPriceNgn),
                priceUsd: Number(variant.retailPriceUsd),
                options: variant.options ?? null,
                imageUrl,
                isWholesale,
            });
            return repo.save(fresh);
        });
        return this.toView(saved, new Map([[variant.id, variant]]), new Map([[product.id, product]]));
    }
    async updateQuantity(userId, variantId, quantity) {
        if (!Number.isInteger(quantity) || quantity < 0) {
            throw new common_1.BadRequestException('quantity must be >= 0');
        }
        const row = await this.cartRepo.findOne({ where: { userId, variantId } });
        if (!row)
            throw new common_1.NotFoundException('Cart item not found');
        if (quantity === 0) {
            await this.cartRepo.delete(row.id);
            return null;
        }
        row.quantity = quantity;
        const saved = await this.cartRepo.save(row);
        return this.hydrateOne(saved);
    }
    async removeItem(userId, variantId) {
        const result = await this.cartRepo.delete({ userId, variantId });
        if (result.affected === 0) {
            throw new common_1.NotFoundException('Cart item not found');
        }
    }
    async clearCart(userId) {
        await this.cartRepo.delete({ userId });
    }
    async mergeCart(userId, entries) {
        const safe = entries.filter((e) => typeof e.variantId === 'string' &&
            e.variantId.length > 0 &&
            Number.isInteger(e.quantity) &&
            e.quantity > 0);
        if (safe.length === 0)
            return this.getCart(userId);
        const byVariant = new Map();
        for (const e of safe) {
            byVariant.set(e.variantId, (byVariant.get(e.variantId) ?? 0) + e.quantity);
        }
        const variantIds = Array.from(byVariant.keys());
        const variants = await this.variantRepo.find({
            where: { id: (0, typeorm_2.In)(variantIds), isActive: true },
        });
        const products = variants.length
            ? await this.productRepo.find({
                where: { id: (0, typeorm_2.In)(Array.from(new Set(variants.map((v) => v.productId)))) },
            })
            : [];
        const productById = new Map(products.map((p) => [p.id, p]));
        const mediaRows = products.length
            ? await this.mediaRepo.find({
                where: { productId: (0, typeorm_2.In)(products.map((p) => p.id)) },
                order: { sortOrder: 'ASC' },
            })
            : [];
        const firstImageByProduct = new Map();
        const firstImageByVariant = new Map();
        for (const m of mediaRows) {
            if (m.mediaType !== 'IMAGE')
                continue;
            if (m.variantId && !firstImageByVariant.has(m.variantId)) {
                firstImageByVariant.set(m.variantId, m.url);
            }
            if (!m.variantId && !firstImageByProduct.has(m.productId)) {
                firstImageByProduct.set(m.productId, m.url);
            }
        }
        const imageForVariant = (variantId, productId) => firstImageByVariant.get(variantId) ??
            firstImageByProduct.get(productId) ??
            null;
        await this.dataSource.transaction(async (manager) => {
            const repo = manager.getRepository(cart_entity_1.CartItem);
            for (const variant of variants) {
                const product = productById.get(variant.productId);
                if (!product || !product.isActive)
                    continue;
                const addQty = byVariant.get(variant.id) ?? 0;
                if (addQty <= 0)
                    continue;
                const existing = await repo.findOne({
                    where: { userId, variantId: variant.id },
                });
                if (existing) {
                    existing.quantity = existing.quantity + addQty;
                    existing.productName = product.name;
                    existing.productSlug = product.slug;
                    existing.variantName = variant.name ?? null;
                    existing.sku = variant.sku;
                    existing.priceNgn = Number(variant.retailPriceNgn);
                    existing.priceUsd = Number(variant.retailPriceUsd);
                    existing.options = variant.options ?? null;
                    existing.imageUrl =
                        imageForVariant(variant.id, product.id) ?? existing.imageUrl;
                    await repo.save(existing);
                }
                else {
                    await repo.save(repo.create({
                        userId,
                        variantId: variant.id,
                        productId: product.id,
                        quantity: addQty,
                        productName: product.name,
                        productSlug: product.slug,
                        variantName: variant.name ?? null,
                        sku: variant.sku,
                        priceNgn: Number(variant.retailPriceNgn),
                        priceUsd: Number(variant.retailPriceUsd),
                        options: variant.options ?? null,
                        imageUrl: imageForVariant(variant.id, product.id),
                    }));
                }
            }
        });
        return this.getCart(userId);
    }
    async loadVariantOrThrow(variantId) {
        const variant = await this.variantRepo.findOne({
            where: { id: variantId, isActive: true },
        });
        if (!variant)
            throw new common_1.NotFoundException('Variant not found');
        const product = await this.productRepo.findOne({
            where: { id: variant.productId },
        });
        if (!product || !product.isActive) {
            throw new common_1.BadRequestException('Product is not available');
        }
        const variantImage = await this.mediaRepo.findOne({
            where: { productId: product.id, variantId, mediaType: 'IMAGE' },
            order: { sortOrder: 'ASC' },
        });
        const firstImage = variantImage ??
            (await this.mediaRepo.findOne({
                where: { productId: product.id, mediaType: 'IMAGE' },
                order: { sortOrder: 'ASC' },
            }));
        return { variant, product, imageUrl: firstImage?.url ?? null };
    }
    async hydrateOne(row) {
        const variant = row.variantId
            ? await this.variantRepo.findOne({ where: { id: row.variantId } })
            : null;
        const product = variant
            ? await this.productRepo.findOne({ where: { id: variant.productId } })
            : null;
        return this.toView(row, new Map(variant ? [[variant.id, variant]] : []), new Map(product ? [[product.id, product]] : []));
    }
    toView(row, byVariantId, byProductId) {
        const liveVariant = row.variantId ? byVariantId.get(row.variantId) : null;
        const liveProduct = liveVariant
            ? byProductId.get(liveVariant.productId)
            : null;
        const variantExists = !!liveVariant;
        const unavailable = !variantExists ||
            !liveVariant.isActive ||
            !liveProduct ||
            !liveProduct.isActive;
        const currentPriceNgn = liveVariant ? Number(liveVariant.retailPriceNgn) : null;
        const currentPriceUsd = liveVariant ? Number(liveVariant.retailPriceUsd) : null;
        const retailNgn = Number(row.priceNgn);
        const retailUsd = Number(row.priceUsd);
        const isWholesale = !!row.isWholesale;
        const effectiveNgn = isWholesale && liveVariant ? Number(liveVariant.wholesalePriceNgn) : retailNgn;
        const effectiveUsd = isWholesale && liveVariant ? Number(liveVariant.wholesalePriceUsd) : retailUsd;
        const priceChanged = variantExists &&
            !isWholesale &&
            (currentPriceNgn !== retailNgn || currentPriceUsd !== retailUsd);
        return {
            id: row.id,
            variantId: row.variantId,
            productId: row.productId,
            productName: liveProduct?.name ?? row.productName,
            productSlug: liveProduct?.slug ?? row.productSlug,
            variantName: liveVariant?.name ?? row.variantName ?? null,
            sku: liveVariant?.sku ?? row.sku,
            quantity: row.quantity,
            priceNgn: effectiveNgn,
            priceUsd: effectiveUsd,
            retailPriceNgn: retailNgn,
            retailPriceUsd: retailUsd,
            currentPriceNgn,
            currentPriceUsd,
            priceChanged,
            unavailable,
            options: (liveVariant?.options ?? row.options) ?? null,
            imageUrl: row.imageUrl ?? null,
            isWholesale,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }
};
exports.CartService = CartService;
exports.CartService = CartService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(cart_entity_1.CartItem)),
    __param(1, (0, typeorm_1.InjectRepository)(product_entity_1.ProductVariant)),
    __param(2, (0, typeorm_1.InjectRepository)(product_entity_1.Product)),
    __param(3, (0, typeorm_1.InjectRepository)(product_entity_1.ProductMedia)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource])
], CartService);
//# sourceMappingURL=cart.service.js.map