import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, TreeRepository } from 'typeorm';
import { Category } from './entities/category.entity';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  MoveCategoryDto,
} from './dto/category.dto';
import { CacheService } from '../../shared/services/cache.service';

/**
 * Maximum depth of the category tree (root + three sub-levels).
 * Arbitrary limit that keeps breadcrumbs readable and URLs short.
 */
const MAX_DEPTH = 4;

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category) private readonly categoryRepo: TreeRepository<Category>,
    private readonly cache: CacheService,
  ) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
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
      if (!parent) throw new NotFoundException(`Parent category ${dto.parentId} not found`);
      const parentDepth = await this.getDepth(parent);
      if (parentDepth + 1 >= MAX_DEPTH) {
        throw new BadRequestException(
          `Cannot nest beyond ${MAX_DEPTH} levels of category depth`,
        );
      }
      category.parent = parent;
    }

    const saved = await this.categoryRepo.save(category);
    await this.cache.invalidateCategories();
    return saved;
  }

  /** Flat list of active categories (cached 30 min) */
  async findAll(): Promise<Category[]> {
    const cacheKey = CacheService.categoryListKey();
    const cached = await this.cache.get<Category[]>(cacheKey);
    if (cached) return cached;

    const categories = await this.categoryRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    await this.cache.set(cacheKey, categories, CacheService.TTL.CATEGORY_LIST);
    return categories;
  }

  /** Hierarchical tree (cached 30 min) */
  async findTree(): Promise<Category[]> {
    const cacheKey = CacheService.categoryTreeKey();
    const cached = await this.cache.get<Category[]>(cacheKey);
    if (cached) return cached;

    const tree = await this.categoryRepo.findTrees();
    await this.cache.set(cacheKey, tree, CacheService.TTL.CATEGORY_LIST);
    return tree;
  }

  /** Find by slug (cached 30 min) */
  async findBySlug(slug: string): Promise<Category> {
    const cacheKey = CacheService.categorySlugKey(slug);
    const cached = await this.cache.get<Category>(cacheKey);
    if (cached) return cached;

    const category = await this.categoryRepo.findOne({
      where: { slug, isActive: true },
    });
    if (!category) throw new NotFoundException(`Category not found`);

    await this.cache.set(cacheKey, category, CacheService.TTL.CATEGORY_LIST);
    return category;
  }

  async findOne(id: string): Promise<Category> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);

    if (dto.name && dto.name !== category.name) {
      category.slug = await this.generateUniqueSlug(dto.name, id);
    }

    Object.assign(category, {
      ...dto,
      slug: category.slug, // guard against dto overriding slug
    });
    const saved = await this.categoryRepo.save(category);
    await this.cache.invalidateCategories();
    return saved;
  }

  /**
   * Reparent a category (or move to the top level) and optionally
   * update its sortOrder among its new siblings. Enforces:
   *   - target parent exists (or null for root)
   *   - moving a node into its own descendant is blocked (would orphan)
   *   - resulting subtree must fit within MAX_DEPTH levels
   */
  async move(id: string, dto: MoveCategoryDto): Promise<Category> {
    const category = await this.categoryRepo.findOne({
      where: { id },
      relations: ['parent'],
    });
    if (!category) throw new NotFoundException(`Category ${id} not found`);

    let newParent: Category | null = null;
    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }
      newParent = await this.categoryRepo.findOne({
        where: { id: dto.parentId },
      });
      if (!newParent) {
        throw new NotFoundException(`Parent category ${dto.parentId} not found`);
      }

      // Prevent moving a node into one of its own descendants (would create a cycle)
      const descendants = await this.categoryRepo.findDescendants(category);
      if (descendants.some((d) => d.id === dto.parentId)) {
        throw new BadRequestException(
          'Cannot move a category into one of its own descendants',
        );
      }

      // Depth check: new parent depth + current subtree depth must be <= MAX_DEPTH
      const newParentDepth = await this.getDepth(newParent);
      const subtreeHeight = await this.getSubtreeHeight(category);
      // total levels the moved subtree will occupy: parentDepth + 1 (category itself) + subtreeHeight
      if (newParentDepth + 1 + subtreeHeight > MAX_DEPTH) {
        throw new BadRequestException(
          `Move would exceed the ${MAX_DEPTH}-level depth limit`,
        );
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

  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);
    category.isActive = false;
    await this.categoryRepo.save(category);
    await this.cache.invalidateCategories();
  }

  // ── Slug helpers ──

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 240);
  }

  private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
    const base = this.slugify(name);
    if (!base) return base;

    const where = excludeId ? { slug: base, id: Not(excludeId) } : { slug: base };
    const clash = await this.categoryRepo.findOne({ where });
    if (!clash) return base;

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
    while (taken.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  }

  // ── Depth helpers ──

  /** Depth = number of ancestors. Root node = 0. */
  private async getDepth(category: Category): Promise<number> {
    const ancestors = await this.categoryRepo.findAncestors(category);
    // findAncestors includes the node itself, so subtract 1
    return Math.max(0, ancestors.length - 1);
  }

  /** Height of the subtree rooted at `category`. A leaf has height 0. */
  private async getSubtreeHeight(category: Category): Promise<number> {
    const descendantsTree = await this.categoryRepo.findDescendantsTree(category);
    return this.measureHeight(descendantsTree);
  }

  private measureHeight(node: Category): number {
    if (!node.children || node.children.length === 0) return 0;
    return 1 + Math.max(...node.children.map((c) => this.measureHeight(c)));
  }
}
