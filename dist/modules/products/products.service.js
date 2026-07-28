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
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const crypto_1 = require("crypto");
const product_entity_1 = require("./entities/product.entity");
const category_entity_1 = require("./entities/category.entity");
const cache_service_1 = require("../../shared/services/cache.service");
const tax_util_1 = require("./tax.util");
let ProductsService = class ProductsService {
    constructor(productRepo, variantRepo, mediaRepo, categoryRepo, cache) {
        this.productRepo = productRepo;
        this.variantRepo = variantRepo;
        this.mediaRepo = mediaRepo;
        this.categoryRepo = categoryRepo;
        this.cache = cache;
    }
    async create(dto) {
        const slug = await this.generateUniqueSlug(dto.name);
        const variantSpecs = await Promise.all(dto.variants.map(async (v) => {
            let sku;
            if (v.sku && v.sku.trim()) {
                sku = v.sku.trim().toUpperCase();
                const taken = await this.variantRepo.findOne({
                    where: { sku, deletedAt: (0, typeorm_2.IsNull)() },
                    select: { id: true },
                });
                if (taken) {
                    throw new common_1.ConflictException(`SKU "${sku}" is already in use`);
                }
            }
            else {
                sku = await this.generateUniqueSku({ categoryId: dto.categoryId });
            }
            return { ...v, sku };
        }));
        const seenSkus = new Set();
        for (const v of variantSpecs) {
            if (seenSkus.has(v.sku)) {
                throw new common_1.ConflictException(`SKU "${v.sku}" appears more than once in this product`);
            }
            seenSkus.add(v.sku);
        }
        const product = this.productRepo.create({
            name: dto.name,
            slug,
            description: dto.description,
            shortDescription: dto.shortDescription,
            categoryId: dto.categoryId,
            isActive: dto.isActive ?? true,
            isFeatured: dto.isFeatured ?? false,
            attributes: dto.attributes,
            metaTitle: dto.metaTitle ?? dto.name,
            metaDescription: dto.metaDescription ?? dto.shortDescription,
            tags: dto.tags,
            variants: variantSpecs.map((v, i) => {
                const retailNgn = (0, tax_util_1.addSalesTax)(v.retailPriceNgn);
                const retailUsd = (0, tax_util_1.addSalesTax)(v.retailPriceUsd);
                return this.variantRepo.create({
                    ...v,
                    retailPriceNgn: retailNgn,
                    retailPriceUsd: retailUsd,
                    wholesalePriceNgn: v.wholesalePriceNgn !== undefined
                        ? (0, tax_util_1.addSalesTax)(v.wholesalePriceNgn)
                        : retailNgn,
                    wholesalePriceUsd: v.wholesalePriceUsd !== undefined
                        ? (0, tax_util_1.addSalesTax)(v.wholesalePriceUsd)
                        : retailUsd,
                    sortOrder: i,
                });
            }),
        });
        const saved = await this.productRepo.save(product);
        await this.cache.invalidateProducts();
        return saved;
    }
    async findAll(query) {
        const cacheKey = cache_service_1.CacheService.productListKey({
            page: query.page,
            limit: query.limit,
            search: query.search,
            categoryId: query.categoryId,
            isActive: query.isActive,
            isFeatured: query.isFeatured,
            sortBy: query.sortBy,
            sortOrder: query.sortOrder,
            withDeleted: query.withDeleted,
            deletedOnly: query.deletedOnly,
        });
        const ttl = query.search ? cache_service_1.CacheService.TTL.SEARCH : cache_service_1.CacheService.TTL.PRODUCT_LIST;
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        const page = query.page ?? 1;
        const limit = Math.min(query.limit ?? 20, 100);
        const skip = (page - 1) * limit;
        if (query.search && query.search.trim().length > 0) {
            return this.searchAll(query, page, limit, skip, cacheKey, ttl);
        }
        const sortBy = query.sortBy ?? 'createdAt';
        const sortOrder = query.sortOrder ?? 'DESC';
        const idQb = this.productRepo.createQueryBuilder('product').select('product.id', 'id');
        if (query.withDeleted || query.deletedOnly) {
            idQb.withDeleted();
        }
        if (query.deletedOnly) {
            idQb.andWhere('product.deletedAt IS NOT NULL');
        }
        if (query.categoryId) {
            idQb.andWhere('product.categoryId = :categoryId', { categoryId: query.categoryId });
        }
        if (query.isActive !== undefined) {
            idQb.andWhere('product.isActive = :isActive', { isActive: query.isActive });
        }
        if (query.isFeatured !== undefined) {
            idQb.andWhere('product.isFeatured = :isFeatured', { isFeatured: query.isFeatured });
        }
        const total = await idQb.clone().getCount();
        if (sortBy === 'retailPriceNgn' || sortBy === 'retailPriceUsd') {
            const col = sortBy === 'retailPriceNgn' ? 'retailPriceNgn' : 'retailPriceUsd';
            idQb
                .addSelect(`(SELECT MIN(v."${col}") FROM product_variants v WHERE v."productId" = product.id)`, 'sort_price')
                .orderBy('sort_price', sortOrder, 'NULLS LAST');
        }
        else {
            idQb.orderBy(`product.${sortBy}`, sortOrder);
        }
        idQb.addOrderBy('product.id', 'ASC');
        const pageRows = await idQb.offset(skip).limit(limit).getRawMany();
        const pageIds = pageRows.map((r) => r.id);
        let items = [];
        if (pageIds.length > 0) {
            const hydrateQb = this.productRepo
                .createQueryBuilder('product')
                .leftJoinAndSelect('product.variants', 'variant')
                .leftJoinAndSelect('product.media', 'media')
                .leftJoinAndSelect('product.category', 'category')
                .where('product.id IN (:...ids)', { ids: pageIds })
                .addOrderBy('media.sortOrder', 'ASC')
                .addOrderBy('variant.sortOrder', 'ASC');
            if (query.withDeleted || query.deletedOnly)
                hydrateQb.withDeleted();
            const rows = await hydrateQb.getMany();
            const byId = new Map(rows.map((r) => [r.id, r]));
            items = pageIds.map((id) => byId.get(id)).filter((p) => !!p);
        }
        const isAdminView = !!(query.withDeleted || query.deletedOnly);
        const visibleItems = isAdminView
            ? items
            : items.map((p) => this.withActiveVariantsOnly(p));
        const result = {
            items: visibleItems,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
        };
        await this.cache.set(cacheKey, result, ttl);
        return result;
    }
    async searchAll(query, page, limit, skip, cacheKey, ttl) {
        const term = query.search.trim();
        const ids = this.productRepo
            .createQueryBuilder('p')
            .select('p.id', 'id')
            .addSelect(`(
          ts_rank_cd(p.search_vector, websearch_to_tsquery('simple', :term))
          + GREATEST(similarity(lower(p.name), lower(:term)), 0)
          + CASE WHEN lower(p.name) ILIKE :like THEN 0.25 ELSE 0 END
        )`, 'rank')
            .where(`(
          p.search_vector @@ websearch_to_tsquery('simple', :term)
          OR similarity(lower(p.name), lower(:term)) > 0.2
          OR lower(p.name) ILIKE :like
        )`, { term, like: `%${term.toLowerCase()}%` });
        if (query.withDeleted || query.deletedOnly)
            ids.withDeleted();
        if (query.deletedOnly)
            ids.andWhere('p.deletedAt IS NOT NULL');
        if (query.categoryId)
            ids.andWhere('p.categoryId = :categoryId', { categoryId: query.categoryId });
        if (query.isActive !== undefined)
            ids.andWhere('p.isActive = :isActive', { isActive: query.isActive });
        if (query.isFeatured !== undefined)
            ids.andWhere('p.isFeatured = :isFeatured', { isFeatured: query.isFeatured });
        const total = await ids.clone().getCount();
        const pageIds = await ids
            .orderBy('rank', 'DESC')
            .addOrderBy('p.createdAt', 'DESC')
            .offset(skip)
            .limit(limit)
            .getRawMany();
        const rankedIds = pageIds.map((r) => r.id);
        if (rankedIds.length === 0) {
            const empty = { items: [], total, page, limit, pages: Math.ceil(total / limit) };
            await this.cache.set(cacheKey, empty, ttl);
            return empty;
        }
        const hydrateQb = this.productRepo
            .createQueryBuilder('product')
            .leftJoinAndSelect('product.variants', 'variant')
            .leftJoinAndSelect('product.media', 'media')
            .leftJoinAndSelect('product.category', 'category')
            .where('product.id IN (:...ids)', { ids: rankedIds })
            .addOrderBy('media.sortOrder', 'ASC')
            .addOrderBy('variant.sortOrder', 'ASC');
        if (query.withDeleted || query.deletedOnly)
            hydrateQb.withDeleted();
        const rows = await hydrateQb.getMany();
        const byId = new Map(rows.map((r) => [r.id, r]));
        const isAdminView = !!(query.withDeleted || query.deletedOnly);
        const items = rankedIds
            .map((id) => byId.get(id))
            .filter((p) => !!p)
            .map((p) => (isAdminView ? p : this.withActiveVariantsOnly(p)));
        const result = { items, total, page, limit, pages: Math.ceil(total / limit) };
        await this.cache.set(cacheKey, result, ttl);
        return result;
    }
    withActiveVariantsOnly(product) {
        if (Array.isArray(product.variants)) {
            product.variants = product.variants.filter((v) => v.isActive);
        }
        return product;
    }
    async findOne(id, opts = {}) {
        const cacheKey = cache_service_1.CacheService.productDetailByIdKey(id) + (opts.withDeleted ? ':withDeleted' : '');
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        const product = await this.productRepo.findOne({
            where: { id },
            relations: ['variants', 'media', 'category'],
            order: { media: { sortOrder: 'ASC' }, variants: { sortOrder: 'ASC' } },
            withDeleted: opts.withDeleted ?? false,
        });
        if (!product) {
            throw new common_1.NotFoundException(`Product ${id} not found`);
        }
        await this.cache.set(cacheKey, product, cache_service_1.CacheService.TTL.PRODUCT_DETAIL);
        return product;
    }
    async findBySlug(slug) {
        const cacheKey = cache_service_1.CacheService.productDetailKey(slug);
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        const product = await this.productRepo.findOne({
            where: { slug, isActive: true },
            relations: ['variants', 'media', 'category'],
            order: { media: { sortOrder: 'ASC' }, variants: { sortOrder: 'ASC' } },
        });
        if (!product) {
            throw new common_1.NotFoundException(`Product not found`);
        }
        this.withActiveVariantsOnly(product);
        await this.cache.set(cacheKey, product, cache_service_1.CacheService.TTL.PRODUCT_DETAIL);
        return product;
    }
    async findVariantBySku(sku) {
        const trimmed = sku.trim();
        if (!trimmed) {
            throw new common_1.NotFoundException('Variant not found');
        }
        return this.runVariantLookup({ sku: trimmed });
    }
    async findVariantByBarcode(barcode) {
        const trimmed = barcode.trim();
        if (!trimmed) {
            throw new common_1.NotFoundException('Variant not found');
        }
        return this.runVariantLookup({ barcode: trimmed });
    }
    async runVariantLookup(where) {
        const qb = this.variantRepo
            .createQueryBuilder('v')
            .innerJoin('products', 'p', 'p.id = v."productId" AND p."deletedAt" IS NULL AND p."isActive" = true')
            .leftJoin('product_media', 'm', 'm."productId" = p.id AND m."deletedAt" IS NULL AND (m."variantId" = v.id OR m."variantId" IS NULL)')
            .where('v."deletedAt" IS NULL')
            .andWhere('v."isActive" = true');
        if (where.sku) {
            qb.andWhere('v.sku = :sku', { sku: where.sku });
        }
        else if (where.barcode) {
            qb.andWhere('v.barcode = :barcode', { barcode: where.barcode });
        }
        else {
            throw new common_1.NotFoundException('Variant not found');
        }
        qb.select([
            'v.id              AS "id"',
            'v."productId"     AS "productId"',
            'v.sku             AS "sku"',
            'v.barcode         AS "barcode"',
            'v.name            AS "variantName"',
            'v."retailPriceNgn"  AS "retailPriceNgn"',
            'v."retailPriceUsd"  AS "retailPriceUsd"',
            'v."wholesalePriceNgn" AS "wholesalePriceNgn"',
            'v."wholesalePriceUsd" AS "wholesalePriceUsd"',
            'v.options         AS "options"',
            'v."isActive"      AS "isActive"',
            'p.name            AS "productName"',
            'p.slug            AS "productSlug"',
            'm.url             AS "imageUrl"',
        ])
            .orderBy('CASE WHEN m."variantId" = v.id THEN 0 ELSE 1 END', 'ASC')
            .addOrderBy('m."sortOrder"', 'ASC')
            .addOrderBy('m."createdAt"', 'ASC')
            .limit(1);
        const row = await qb.getRawOne();
        if (!row) {
            throw new common_1.NotFoundException('Variant not found');
        }
        return {
            id: row.id,
            productId: row.productId,
            productName: row.productName,
            productSlug: row.productSlug,
            variantName: row.variantName ?? null,
            sku: row.sku,
            barcode: row.barcode ?? null,
            price: {
                retailNgn: row.retailPriceNgn,
                retailUsd: row.retailPriceUsd,
                wholesaleNgn: row.wholesalePriceNgn,
                wholesaleUsd: row.wholesalePriceUsd,
            },
            options: row.options ?? null,
            imageUrl: row.imageUrl ?? null,
            isActive: row.isActive,
        };
    }
    async update(id, dto) {
        const product = await this.findOne(id);
        if (dto.name && dto.name !== product.name) {
            const newSlug = await this.generateUniqueSlug(dto.name, id);
            Object.assign(product, { ...dto, slug: newSlug });
        }
        else {
            Object.assign(product, dto);
        }
        const saved = await this.productRepo.save(product);
        await this.cache.invalidateProducts();
        return saved;
    }
    async bulkUpdate(dto) {
        if (!dto.ids || dto.ids.length === 0) {
            return { updated: 0 };
        }
        const patch = {};
        if (dto.isActive !== undefined)
            patch.isActive = dto.isActive;
        if (dto.isFeatured !== undefined)
            patch.isFeatured = dto.isFeatured;
        if (dto.categoryId !== undefined)
            patch.categoryId = dto.categoryId || undefined;
        if (Object.keys(patch).length === 0)
            return { updated: 0 };
        const result = await this.productRepo.update({ id: (0, typeorm_2.In)(dto.ids) }, patch);
        await this.cache.invalidateProducts();
        return { updated: result.affected ?? 0 };
    }
    async remove(id) {
        const product = await this.findOne(id);
        await this.productRepo.softRemove(product);
        await this.cache.invalidateProducts();
    }
    async restore(id) {
        await this.productRepo.restore(id);
        await this.cache.invalidateProducts();
        return this.findOne(id, { withDeleted: true });
    }
    slugify(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 340);
    }
    async generateUniqueSlug(name, excludeId) {
        const base = this.slugify(name);
        if (!base)
            return base;
        const where = excludeId ? { slug: base, id: (0, typeorm_2.Not)(excludeId) } : { slug: base };
        const existing = await this.productRepo.findOne({
            where,
            withDeleted: true,
            select: { id: true },
        });
        if (!existing)
            return base;
        const candidates = await this.productRepo
            .createQueryBuilder('p')
            .withDeleted()
            .select(['p.id', 'p.slug'])
            .where('p.slug = :base OR p.slug LIKE :pattern', {
            base,
            pattern: `${base}-%`,
        })
            .andWhere(excludeId ? 'p.id != :excludeId' : '1=1', { excludeId })
            .getMany();
        const taken = new Set(candidates.map((c) => c.slug));
        let n = 2;
        while (taken.has(`${base}-${n}`))
            n += 1;
        return `${base}-${n}`;
    }
    async addVariantToProduct(productId, dto) {
        const product = await this.findOne(productId);
        let sku;
        if (dto.sku && dto.sku.trim()) {
            sku = dto.sku.trim().toUpperCase();
            const taken = await this.variantRepo.findOne({
                where: { sku, deletedAt: (0, typeorm_2.IsNull)() },
                select: { id: true },
            });
            if (taken) {
                throw new common_1.ConflictException(`SKU "${sku}" is already in use`);
            }
        }
        else {
            sku = await this.generateUniqueSku({
                categoryName: product.category?.name,
                categoryId: product.categoryId,
            });
        }
        const maxSort = await this.variantRepo
            .createQueryBuilder('v')
            .select('COALESCE(MAX(v."sortOrder"), -1)', 'max')
            .where('v."productId" = :productId', { productId })
            .getRawOne();
        const sortOrder = Number(maxSort?.max ?? -1) + 1;
        const retailNgn = (0, tax_util_1.addSalesTax)(dto.retailPriceNgn);
        const retailUsd = (0, tax_util_1.addSalesTax)(dto.retailPriceUsd);
        const variant = this.variantRepo.create({
            productId,
            sku,
            name: dto.name,
            retailPriceNgn: retailNgn,
            retailPriceUsd: retailUsd,
            wholesalePriceNgn: dto.wholesalePriceNgn !== undefined
                ? (0, tax_util_1.addSalesTax)(dto.wholesalePriceNgn)
                : retailNgn,
            wholesalePriceUsd: dto.wholesalePriceUsd !== undefined
                ? (0, tax_util_1.addSalesTax)(dto.wholesalePriceUsd)
                : retailUsd,
            compareAtPriceNgn: dto.compareAtPriceNgn,
            compareAtPriceUsd: dto.compareAtPriceUsd,
            costPriceNgn: dto.costPriceNgn,
            weightKg: dto.weightKg,
            trackInventory: dto.trackInventory ?? true,
            isActive: dto.isActive ?? true,
            options: dto.options,
            barcode: dto.barcode?.trim() || undefined,
            sortOrder,
        });
        const saved = await this.variantRepo.save(variant);
        await this.cache.invalidateProducts();
        return saved;
    }
    async updateVariant(productId, variantId, dto) {
        const variant = await this.variantRepo.findOne({
            where: { id: variantId, productId, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (!variant) {
            throw new common_1.NotFoundException('Variant not found on this product');
        }
        if (dto.sku !== undefined) {
            const newSku = dto.sku.trim().toUpperCase();
            if (newSku !== variant.sku) {
                const taken = await this.variantRepo.findOne({
                    where: { sku: newSku, id: (0, typeorm_2.Not)(variantId), deletedAt: (0, typeorm_2.IsNull)() },
                    select: { id: true },
                });
                if (taken) {
                    throw new common_1.ConflictException(`SKU "${newSku}" is already in use`);
                }
                variant.sku = newSku;
            }
        }
        if (dto.name !== undefined)
            variant.name = dto.name;
        if (dto.retailPriceNgn !== undefined)
            variant.retailPriceNgn = dto.retailPriceNgn;
        if (dto.retailPriceUsd !== undefined)
            variant.retailPriceUsd = dto.retailPriceUsd;
        if (dto.wholesalePriceNgn !== undefined)
            variant.wholesalePriceNgn = dto.wholesalePriceNgn;
        if (dto.wholesalePriceUsd !== undefined)
            variant.wholesalePriceUsd = dto.wholesalePriceUsd;
        if (dto.compareAtPriceNgn !== undefined)
            variant.compareAtPriceNgn = dto.compareAtPriceNgn;
        if (dto.compareAtPriceUsd !== undefined)
            variant.compareAtPriceUsd = dto.compareAtPriceUsd;
        if (dto.costPriceNgn !== undefined)
            variant.costPriceNgn = dto.costPriceNgn;
        if (dto.weightKg !== undefined)
            variant.weightKg = dto.weightKg;
        if (dto.trackInventory !== undefined)
            variant.trackInventory = dto.trackInventory;
        if (dto.isActive !== undefined)
            variant.isActive = dto.isActive;
        if (dto.options !== undefined)
            variant.options = dto.options;
        if (dto.barcode !== undefined) {
            variant.barcode = dto.barcode.trim() || undefined;
        }
        const saved = await this.variantRepo.save(variant);
        await this.cache.invalidateProducts();
        return saved;
    }
    async deactivateVariant(productId, variantId) {
        const variant = await this.variantRepo.findOne({
            where: { id: variantId, productId, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (!variant) {
            throw new common_1.NotFoundException('Variant not found on this product');
        }
        if (!variant.isActive) {
            return variant;
        }
        const otherActive = await this.variantRepo.count({
            where: {
                productId,
                id: (0, typeorm_2.Not)(variantId),
                isActive: true,
                deletedAt: (0, typeorm_2.IsNull)(),
            },
        });
        if (otherActive === 0) {
            throw new common_1.ConflictException({
                error: 'LAST_ACTIVE_VARIANT',
                message: 'Cannot deactivate the last active variant. Deactivate the product itself, or activate another variant first.',
            });
        }
        variant.isActive = false;
        const saved = await this.variantRepo.save(variant);
        await this.cache.invalidateProducts();
        return saved;
    }
    async generateUniqueSku(opts) {
        const suffix = await this.resolveSkuSuffix(opts);
        for (let attempt = 0; attempt < 50; attempt += 1) {
            const middle = randomBase32(6);
            const candidate = `MGN-${middle}-${suffix}`;
            const taken = await this.variantRepo.findOne({
                where: { sku: candidate },
                withDeleted: true,
                select: { id: true },
            });
            if (!taken)
                return candidate;
        }
        throw new common_1.ConflictException('Failed to generate a unique SKU after 50 attempts');
    }
    async resolveSkuSuffix(opts) {
        let categoryName = opts.categoryName ?? '';
        if (!categoryName && opts.categoryId) {
            const cat = await this.categoryRepo.findOne({
                where: { id: opts.categoryId },
                select: { id: true, name: true },
            });
            categoryName = cat?.name ?? '';
        }
        const cleaned = categoryName
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[^a-z]/g, '');
        if (!cleaned)
            return 'BAG';
        if (cleaned.includes('bag'))
            return 'BAG';
        if (cleaned.includes('shoe'))
            return 'SHO';
        if (cleaned.includes('belt'))
            return 'BLT';
        if (cleaned.includes('wallet'))
            return 'WLT';
        if (cleaned.length >= 3)
            return cleaned.slice(0, 3).toUpperCase();
        return (cleaned.toUpperCase() + 'XXX').slice(0, 3);
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(product_entity_1.Product)),
    __param(1, (0, typeorm_1.InjectRepository)(product_entity_1.ProductVariant)),
    __param(2, (0, typeorm_1.InjectRepository)(product_entity_1.ProductMedia)),
    __param(3, (0, typeorm_1.InjectRepository)(category_entity_1.Category)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        cache_service_1.CacheService])
], ProductsService);
function randomBase32(length) {
    const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const bytes = (0, crypto_1.randomBytes)(length);
    let out = '';
    for (let i = 0; i < length; i += 1) {
        out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return out;
}
//# sourceMappingURL=products.service.js.map