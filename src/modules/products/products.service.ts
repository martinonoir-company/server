import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { Product, ProductVariant, ProductMedia } from './entities/product.entity';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  BulkUpdateProductsDto,
} from './dto/product.dto';
import { CacheService } from '../../shared/services/cache.service';

/**
 * Response shape for the scanner mobile app's variant lookup endpoints.
 * Stock is NOT bundled here — the client fetches `/inventory/levels/:id`
 * separately so this payload stays cacheable. Prices are in MINOR units
 * (kobo / cents) returned as strings (Postgres bigint -> JS would lose
 * precision past 2^53, and we treat them as opaque integer strings on
 * the client).
 */
export interface VariantLookupResult {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantName: string | null;
  sku: string;
  barcode: string | null;
  price: {
    retailNgn: string;
    retailUsd: string;
    wholesaleNgn: string;
    wholesaleUsd: string;
  };
  options: Record<string, string> | null;
  imageUrl: string | null;
  isActive: boolean;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant) private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(ProductMedia) private readonly mediaRepo: Repository<ProductMedia>,
    private readonly cache: CacheService,
  ) {}

  // ── Create ──

  async create(dto: CreateProductDto): Promise<Product> {
    const slug = await this.generateUniqueSlug(dto.name);

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
      variants: dto.variants.map((v, i) =>
        this.variantRepo.create({
          ...v,
          // Default wholesale to retail if not provided, and vice versa
          wholesalePriceNgn: v.wholesalePriceNgn ?? v.retailPriceNgn,
          wholesalePriceUsd: v.wholesalePriceUsd ?? v.retailPriceUsd,
          sortOrder: i,
        }),
      ),
    });

    const saved = await this.productRepo.save(product);

    // Invalidate product list caches
    await this.cache.invalidateProducts();

    return saved;
  }

  // ── Find All (paginated, cached) ──

  async findAll(query: ProductQueryDto): Promise<{
    items: Product[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    // Build cache key from query params (include withDeleted so the two views stay separate)
    const cacheKey = CacheService.productListKey({
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

    // Check cache (skip for search queries — use shorter TTL)
    const ttl = query.search ? CacheService.TTL.SEARCH : CacheService.TTL.PRODUCT_LIST;
    const cached = await this.cache.get<{
      items: Product[];
      total: number;
      page: number;
      limit: number;
      pages: number;
    }>(cacheKey);
    if (cached) return cached;

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    // When there's a search term, use a two-phase query:
    //   1) rank matching product IDs via tsvector + trigram similarity
    //   2) hydrate those IDs with relations while preserving rank order
    // This keeps relevance-sorted results correct even with left joins,
    // and tolerates typos (e.g. "lether breafcase" → "leather briefcase").
    if (query.search && query.search.trim().length > 0) {
      return this.searchAll(query, page, limit, skip, cacheKey, ttl);
    }

    const qb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.variants', 'variant')
      .leftJoinAndSelect('product.media', 'media')
      .leftJoinAndSelect('product.category', 'category');

    // Soft-delete visibility
    if (query.withDeleted || query.deletedOnly) {
      qb.withDeleted();
    }
    if (query.deletedOnly) {
      qb.andWhere('product.deletedAt IS NOT NULL');
    }

    if (query.categoryId) {
      qb.andWhere('product.categoryId = :categoryId', { categoryId: query.categoryId });
    }

    if (query.isActive !== undefined) {
      qb.andWhere('product.isActive = :isActive', { isActive: query.isActive });
    }

    if (query.isFeatured !== undefined) {
      qb.andWhere('product.isFeatured = :isFeatured', { isFeatured: query.isFeatured });
    }

    // Sorting
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'DESC';
    if (sortBy === 'retailPriceNgn' || sortBy === 'retailPriceUsd') {
      qb.addOrderBy(`variant.${sortBy}`, sortOrder);
    } else {
      qb.addOrderBy(`product.${sortBy}`, sortOrder);
    }

    qb.addOrderBy('media.sortOrder', 'ASC');
    qb.addOrderBy('variant.sortOrder', 'ASC');
    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();

    const result = { items, total, page, limit, pages: Math.ceil(total / limit) };

    // Cache the result
    await this.cache.set(cacheKey, result, ttl);

    return result;
  }

  /**
   * Ranked full-text search. Uses websearch_to_tsquery (so users can
   * type "bag -sale" or quoted phrases) against a pre-generated tsvector
   * column, then falls back to trigram similarity so typos like
   * "lether breafcase" still surface the correct product. Results are
   * ordered by combined rank descending.
   */
  private async searchAll(
    query: ProductQueryDto,
    page: number,
    limit: number,
    skip: number,
    cacheKey: string,
    ttl: number,
  ) {
    const term = query.search!.trim();

    const ids = this.productRepo
      .createQueryBuilder('p')
      .select('p.id', 'id')
      .addSelect(
        `(
          ts_rank_cd(p.search_vector, websearch_to_tsquery('simple', :term))
          + GREATEST(similarity(lower(p.name), lower(:term)), 0)
          + CASE WHEN lower(p.name) ILIKE :like THEN 0.25 ELSE 0 END
        )`,
        'rank',
      )
      .where(
        `(
          p.search_vector @@ websearch_to_tsquery('simple', :term)
          OR similarity(lower(p.name), lower(:term)) > 0.2
          OR lower(p.name) ILIKE :like
        )`,
        { term, like: `%${term.toLowerCase()}%` },
      );

    if (query.withDeleted || query.deletedOnly) ids.withDeleted();
    if (query.deletedOnly) ids.andWhere('p.deletedAt IS NOT NULL');
    if (query.categoryId)
      ids.andWhere('p.categoryId = :categoryId', { categoryId: query.categoryId });
    if (query.isActive !== undefined)
      ids.andWhere('p.isActive = :isActive', { isActive: query.isActive });
    if (query.isFeatured !== undefined)
      ids.andWhere('p.isFeatured = :isFeatured', { isFeatured: query.isFeatured });

    // Count total matches (clone so ordering/offset don't interfere)
    const total = await ids.clone().getCount();

    // Fetch ranked page of IDs
    const pageIds = await ids
      .orderBy('rank', 'DESC')
      .addOrderBy('p.createdAt', 'DESC')
      .offset(skip)
      .limit(limit)
      .getRawMany<{ id: string; rank: string }>();

    const rankedIds = pageIds.map((r) => r.id);
    if (rankedIds.length === 0) {
      const empty = { items: [], total, page, limit, pages: Math.ceil(total / limit) };
      await this.cache.set(cacheKey, empty, ttl);
      return empty;
    }

    // Hydrate with relations
    const hydrateQb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.variants', 'variant')
      .leftJoinAndSelect('product.media', 'media')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.id IN (:...ids)', { ids: rankedIds })
      .addOrderBy('media.sortOrder', 'ASC')
      .addOrderBy('variant.sortOrder', 'ASC');

    if (query.withDeleted || query.deletedOnly) hydrateQb.withDeleted();

    const rows = await hydrateQb.getMany();
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = rankedIds
      .map((id) => byId.get(id))
      .filter((p): p is Product => !!p);

    const result = { items, total, page, limit, pages: Math.ceil(total / limit) };
    await this.cache.set(cacheKey, result, ttl);
    return result;
  }

  // ── Find One (by ID, cached) ──

  async findOne(id: string, opts: { withDeleted?: boolean } = {}): Promise<Product> {
    const cacheKey = CacheService.productDetailByIdKey(id) + (opts.withDeleted ? ':withDeleted' : '');
    const cached = await this.cache.get<Product>(cacheKey);
    if (cached) return cached;

    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['variants', 'media', 'category'],
      order: { media: { sortOrder: 'ASC' }, variants: { sortOrder: 'ASC' } },
      withDeleted: opts.withDeleted ?? false,
    });
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    await this.cache.set(cacheKey, product, CacheService.TTL.PRODUCT_DETAIL);
    return product;
  }

  // ── Find by Slug (storefront, cached) ──

  async findBySlug(slug: string): Promise<Product> {
    const cacheKey = CacheService.productDetailKey(slug);
    const cached = await this.cache.get<Product>(cacheKey);
    if (cached) return cached;

    const product = await this.productRepo.findOne({
      where: { slug, isActive: true },
      relations: ['variants', 'media', 'category'],
      order: { media: { sortOrder: 'ASC' }, variants: { sortOrder: 'ASC' } },
    });
    if (!product) {
      throw new NotFoundException(`Product not found`);
    }

    await this.cache.set(cacheKey, product, CacheService.TTL.PRODUCT_DETAIL);
    return product;
  }

  // ─────────────────────────────────────────────────────────────
  // Variant lookup (scanner mobile app, POS quick-scan)
  // ─────────────────────────────────────────────────────────────

  /**
   * Look up a single variant by SKU. Returns variant identity + parent
   * product context + price + first image. Does NOT include stock — the
   * caller is expected to fetch /inventory/levels/:variantId in parallel
   * so the variant payload remains cacheable.
   *
   * Throws NotFoundException if the SKU does not match an active variant
   * on an active, non-deleted product.
   */
  async findVariantBySku(sku: string): Promise<VariantLookupResult> {
    const trimmed = sku.trim();
    if (!trimmed) {
      throw new NotFoundException('Variant not found');
    }
    return this.runVariantLookup({ sku: trimmed });
  }

  /**
   * Look up a single variant by barcode. Same shape as findVariantBySku.
   * Barcodes are nullable on variants — only barcoded variants are
   * resolvable through this path.
   */
  async findVariantByBarcode(barcode: string): Promise<VariantLookupResult> {
    const trimmed = barcode.trim();
    if (!trimmed) {
      throw new NotFoundException('Variant not found');
    }
    return this.runVariantLookup({ barcode: trimmed });
  }

  /**
   * Internal: shared query path for SKU and barcode lookup. Uses a single
   * SELECT joining product + first media row, scoped to active rows on
   * both the variant and the product.
   */
  private async runVariantLookup(
    where: { sku?: string; barcode?: string },
  ): Promise<VariantLookupResult> {
    const qb = this.variantRepo
      .createQueryBuilder('v')
      .innerJoin('products', 'p', 'p.id = v."productId" AND p."deletedAt" IS NULL AND p."isActive" = true')
      .leftJoin(
        'product_media',
        'm',
        'm."productId" = p.id AND m."deletedAt" IS NULL',
      )
      .where('v."deletedAt" IS NULL')
      .andWhere('v."isActive" = true');

    if (where.sku) {
      qb.andWhere('v.sku = :sku', { sku: where.sku });
    } else if (where.barcode) {
      qb.andWhere('v.barcode = :barcode', { barcode: where.barcode });
    } else {
      throw new NotFoundException('Variant not found');
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
      .orderBy('m."sortOrder"', 'ASC')
      .addOrderBy('m."createdAt"', 'ASC')
      .limit(1);

    const row = await qb.getRawOne<{
      id: string;
      productId: string;
      sku: string;
      barcode: string | null;
      variantName: string | null;
      retailPriceNgn: string;
      retailPriceUsd: string;
      wholesalePriceNgn: string;
      wholesalePriceUsd: string;
      options: Record<string, string> | null;
      isActive: boolean;
      productName: string;
      productSlug: string;
      imageUrl: string | null;
    }>();

    if (!row) {
      throw new NotFoundException('Variant not found');
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

  // ── Update ──

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);

    if (dto.name && dto.name !== product.name) {
      const newSlug = await this.generateUniqueSlug(dto.name, id);
      Object.assign(product, { ...dto, slug: newSlug });
    } else {
      Object.assign(product, dto);
    }

    const saved = await this.productRepo.save(product);

    // Invalidate all product caches (list + detail)
    await this.cache.invalidateProducts();

    return saved;
  }

  // ── Bulk Update ──

  /**
   * Apply the same set of flag changes to a batch of products.
   * Currently supports isActive, isFeatured, and categoryId — the
   * most common admin bulk actions. Slug/name/variant edits remain
   * single-record operations because they require per-row validation.
   */
  async bulkUpdate(dto: BulkUpdateProductsDto): Promise<{ updated: number }> {
    if (!dto.ids || dto.ids.length === 0) {
      return { updated: 0 };
    }

    const patch: Partial<Product> = {};
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    if (dto.isFeatured !== undefined) patch.isFeatured = dto.isFeatured;
    if (dto.categoryId !== undefined) patch.categoryId = dto.categoryId || undefined;

    if (Object.keys(patch).length === 0) return { updated: 0 };

    const result = await this.productRepo.update({ id: In(dto.ids) }, patch);
    await this.cache.invalidateProducts();
    return { updated: result.affected ?? 0 };
  }

  // ── Soft Delete ──

  async remove(id: string): Promise<void> {
    const product = await this.findOne(id);
    await this.productRepo.softRemove(product);
    await this.cache.invalidateProducts();
  }

  // ── Restore ──

  async restore(id: string): Promise<Product> {
    await this.productRepo.restore(id);
    await this.cache.invalidateProducts();
    return this.findOne(id, { withDeleted: true });
  }

  // ── Slug Generation ──

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 340); // leave headroom for -NN suffix (column limit 350)
  }

  /**
   * Generate a slug that is unique across the `products` table. If the
   * base slug already exists for a different product, append a numeric
   * suffix: `-2`, `-3`, ... until an unused one is found. Includes
   * soft-deleted rows so we don't collide with a restored record later.
   */
  private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
    const base = this.slugify(name);
    if (!base) return base;

    const where = excludeId ? { slug: base, id: Not(excludeId) } : { slug: base };
    const existing = await this.productRepo.findOne({
      where,
      withDeleted: true,
      select: { id: true },
    });
    if (!existing) return base;

    // Look up all siblings with the same base stem and pick next number.
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
    while (taken.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  }
}
