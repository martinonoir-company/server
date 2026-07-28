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
exports.CategoriesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const category_entity_1 = require("./entities/category.entity");
const cache_service_1 = require("../../shared/services/cache.service");
const MAX_DEPTH = 4;
let CategoriesService = class CategoriesService {
    constructor(categoryRepo, cache) {
        this.categoryRepo = categoryRepo;
        this.cache = cache;
    }
    async create(dto) {
        const slug = await this.generateUniqueSlug(dto.name);
        const category = this.categoryRepo.create({
            name: dto.name,
            slug,
            alias: dto.alias,
            description: dto.description,
            imageUrl: dto.imageUrl,
            sortOrder: dto.sortOrder ?? 0,
            isActive: dto.isActive ?? true,
            metaTitle: dto.metaTitle ?? dto.name,
            metaDescription: dto.metaDescription,
        });
        if (dto.parentId) {
            const parent = await this.categoryRepo.findOne({
                where: { id: dto.parentId },
            });
            if (!parent)
                throw new common_1.NotFoundException(`Parent category ${dto.parentId} not found`);
            const parentDepth = await this.getDepth(parent);
            if (parentDepth + 1 >= MAX_DEPTH) {
                throw new common_1.BadRequestException(`Cannot nest beyond ${MAX_DEPTH} levels of category depth`);
            }
            category.parent = parent;
        }
        const saved = await this.categoryRepo.save(category);
        await this.cache.invalidateCategories();
        return saved;
    }
    async findAll() {
        const cacheKey = cache_service_1.CacheService.categoryListKey();
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        const categories = await this.categoryRepo.find({
            where: { isActive: true },
            order: { sortOrder: 'ASC', name: 'ASC' },
        });
        await this.cache.set(cacheKey, categories, cache_service_1.CacheService.TTL.CATEGORY_LIST);
        return categories;
    }
    async findPaginated(page = 1, limit = 12) {
        const safePage = Math.max(1, Math.floor(page));
        const safeLimit = Math.min(48, Math.max(1, Math.floor(limit)));
        const cacheKey = `categories:paginated:p${safePage}:l${safeLimit}`;
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        const [items, total] = await this.categoryRepo.findAndCount({
            where: { isActive: true },
            order: { sortOrder: 'ASC', name: 'ASC' },
            skip: (safePage - 1) * safeLimit,
            take: safeLimit,
        });
        const result = {
            items,
            total,
            page: safePage,
            limit: safeLimit,
            pages: Math.max(1, Math.ceil(total / safeLimit)),
        };
        await this.cache.set(cacheKey, result, cache_service_1.CacheService.TTL.CATEGORY_LIST);
        return result;
    }
    async findTree() {
        const cacheKey = cache_service_1.CacheService.categoryTreeKey();
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        const tree = await this.categoryRepo.findTrees();
        await this.cache.set(cacheKey, tree, cache_service_1.CacheService.TTL.CATEGORY_LIST);
        return tree;
    }
    async findBySlug(slug) {
        const cacheKey = cache_service_1.CacheService.categorySlugKey(slug);
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        const category = await this.categoryRepo.findOne({
            where: { slug, isActive: true },
        });
        if (!category)
            throw new common_1.NotFoundException(`Category not found`);
        await this.cache.set(cacheKey, category, cache_service_1.CacheService.TTL.CATEGORY_LIST);
        return category;
    }
    async findOne(id) {
        const category = await this.categoryRepo.findOne({ where: { id } });
        if (!category)
            throw new common_1.NotFoundException(`Category ${id} not found`);
        return category;
    }
    async update(id, dto) {
        const category = await this.findOne(id);
        if (dto.name && dto.name !== category.name) {
            category.slug = await this.generateUniqueSlug(dto.name, id);
        }
        Object.assign(category, {
            ...dto,
            slug: category.slug,
        });
        const saved = await this.categoryRepo.save(category);
        await this.cache.invalidateCategories();
        return saved;
    }
    async move(id, dto) {
        const category = await this.categoryRepo.findOne({
            where: { id },
            relations: ['parent'],
        });
        if (!category)
            throw new common_1.NotFoundException(`Category ${id} not found`);
        let newParent = null;
        if (dto.parentId) {
            if (dto.parentId === id) {
                throw new common_1.BadRequestException('A category cannot be its own parent');
            }
            newParent = await this.categoryRepo.findOne({
                where: { id: dto.parentId },
            });
            if (!newParent) {
                throw new common_1.NotFoundException(`Parent category ${dto.parentId} not found`);
            }
            const descendants = await this.categoryRepo.findDescendants(category);
            if (descendants.some((d) => d.id === dto.parentId)) {
                throw new common_1.BadRequestException('Cannot move a category into one of its own descendants');
            }
            const newParentDepth = await this.getDepth(newParent);
            const subtreeHeight = await this.getSubtreeHeight(category);
            if (newParentDepth + 1 + subtreeHeight > MAX_DEPTH) {
                throw new common_1.BadRequestException(`Move would exceed the ${MAX_DEPTH}-level depth limit`);
            }
        }
        category.parent = newParent ?? undefined;
        if (dto.sortOrder !== undefined) {
            category.sortOrder = dto.sortOrder;
        }
        const saved = await this.categoryRepo.save(category);
        await this.cache.invalidateCategories();
        return saved;
    }
    async remove(id) {
        const category = await this.findOne(id);
        category.isActive = false;
        await this.categoryRepo.save(category);
        await this.cache.invalidateCategories();
    }
    slugify(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 240);
    }
    async generateUniqueSlug(name, excludeId) {
        const base = this.slugify(name);
        if (!base)
            return base;
        const where = excludeId ? { slug: base, id: (0, typeorm_2.Not)(excludeId) } : { slug: base };
        const clash = await this.categoryRepo.findOne({ where });
        if (!clash)
            return base;
        const candidates = await this.categoryRepo
            .createQueryBuilder('c')
            .select(['c.id', 'c.slug'])
            .where('c.slug = :base OR c.slug LIKE :pattern', {
            base,
            pattern: `${base}-%`,
        })
            .andWhere(excludeId ? 'c.id != :excludeId' : '1=1', { excludeId })
            .getMany();
        const taken = new Set(candidates.map((c) => c.slug));
        let n = 2;
        while (taken.has(`${base}-${n}`))
            n += 1;
        return `${base}-${n}`;
    }
    async getDepth(category) {
        const ancestors = await this.categoryRepo.findAncestors(category);
        return Math.max(0, ancestors.length - 1);
    }
    async getSubtreeHeight(category) {
        const descendantsTree = await this.categoryRepo.findDescendantsTree(category);
        return this.measureHeight(descendantsTree);
    }
    measureHeight(node) {
        if (!node.children || node.children.length === 0)
            return 0;
        return 1 + Math.max(...node.children.map((c) => this.measureHeight(c)));
    }
};
exports.CategoriesService = CategoriesService;
exports.CategoriesService = CategoriesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(category_entity_1.Category)),
    __metadata("design:paramtypes", [typeorm_2.TreeRepository,
        cache_service_1.CacheService])
], CategoriesService);
//# sourceMappingURL=categories.service.js.map