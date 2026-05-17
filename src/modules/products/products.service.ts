import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull, Not } from 'typeorm';
import { randomBytes } from 'crypto';
import { Product, ProductVariant, ProductMedia } from './entities/product.entity';
import { Category } from './entities/category.entity';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  BulkUpdateProductsDto,
  AddVariantDto,
  UpdateVariantDto,
} from './dto/product.dto';
import { CacheService } from '../../shared/services/cache.service';
import { addSalesTax } from './tax.util';

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
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    private readonly cache: CacheService,
  ) {}

  // ── Create ──

  async create(dto: CreateProductDto): Promise<Product> {
    const slug = await this.generateUniqueSlug(dto.name);

    // Resolve missing SKUs up-front. Any variant that arrives without a
    // SKU gets a fresh auto-generated MGN-XXXXXX-SUF code. Supplied SKUs
    // are normalised (trim + uppercase) and uniqueness-checked.
    const variantSpecs = await Promise.all(
      dto.variants.map(async (v) => {
        let sku: string;
        if (v.sku && v.sku.trim()) {
          sku = v.sku.trim().toUpperCase();
          const taken = await this.variantRepo.findOne({
            where: { sku, deletedAt: IsNull() },
            select: { id: true },
          });
          if (taken) {
            throw new ConflictException(`SKU "${sku}" is already in use`);
          }
        } else {
          sku = await this.generateUniqueSku({ categoryId: dto.categoryId });
        }
        return { ...v, sku };
      }),
    );

    // Defensive: same SKU appearing twice in the same payload (e.g. a
    // copy-paste in the admin form) would otherwise be caught by the DB
    // unique constraint with a less helpful error.
    const seenSkus = new Set<string>();
    for (const v of variantSpecs) {
      if (seenSkus.has(v.sku)) {
        throw new ConflictException(
          `SKU "${v.sku}" appears more than once in this product`,
        );
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
        // Selling prices are made tax-inclusive on create: a flat 7.5%
        // is added to the entered retail/wholesale prices. Cost price and
        // compare-at price are NOT taxed. See tax.util.ts.
        const retailNgn = addSalesTax(v.retailPriceNgn);
        const retailUsd = addSalesTax(v.retailPriceUsd);
        return this.variantRepo.create({
          ...v,
          retailPriceNgn: retailNgn,
          retailPriceUsd: retailUsd,
          // Default wholesale to retail if not provided; either way the
          // stored figure is tax-inclusive.
          wholesalePriceNgn:
            v.wholesalePriceNgn !== undefined
              ? addSalesTax(v.wholesalePriceNgn)
              : retailNgn,
          wholesalePriceUsd:
            v.wholesalePriceUsd !== undefined
              ? addSalesTax(v.wholesalePriceUsd)
              : retailUsd,
          sortOrder: i,
        });
      }),
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

    // Public/storefront view: hide inactive variants so they can't be added
    // to cart. The admin "show everything" view (withDeleted/deletedOnly)
    // keeps them visible.
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
    const isAdminView = !!(query.withDeleted || query.deletedOnly);
    const items = rankedIds
      .map((id) => byId.get(id))
      .filter((p): p is Product => !!p)
      .map((p) => (isAdminView ? p : this.withActiveVariantsOnly(p)));

    const result = { items, total, page, limit, pages: Math.ceil(total / limit) };
    await this.cache.set(cacheKey, result, ttl);
    return result;
  }

  /**
   * Strip inactive variants from a product before it leaves the API on a
   * public/storefront path. An inactive variant must never appear as a
   * buyable option: the storefront would render it, let the user click
   * "Add to Cart", and the cart endpoint would then 404 with "Variant not
   * found" (it filters on isActive) — silently emptying the cart.
   *
   * The admin product-detail path (findOne) deliberately does NOT call
   * this, so the variant editor can still see and reactivate them.
   */
  private withActiveVariantsOnly<T extends { variants?: ProductVariant[] }>(
    product: T,
  ): T {
    if (Array.isArray(product.variants)) {
      product.variants = product.variants.filter((v) => v.isActive);
    }
    return product;
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

    // Storefront-only path — never expose inactive variants as buyable.
    this.withActiveVariantsOnly(product);

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

  // ─────────────────────────────────────────────────────────────
  // Variant CRUD (admin variant editor)
  // ─────────────────────────────────────────────────────────────

  /**
   * Add a new variant to an existing product.
   *
   * SKU handling:
   *  - If the caller supplies a SKU, validate uniqueness (active rows).
   *  - If absent, auto-generate one in the MGN-<6-base32>-<SUFFIX>
   *    format. The suffix is derived from the product context (BAG by
   *    default — extensible later). Includes a uniqueness check against
   *    the DB so we never collide even on cosmic-ray odds.
   */
  async addVariantToProduct(
    productId: string,
    dto: AddVariantDto,
  ): Promise<ProductVariant> {
    const product = await this.findOne(productId);

    let sku: string;
    if (dto.sku && dto.sku.trim()) {
      sku = dto.sku.trim().toUpperCase();
      const taken = await this.variantRepo.findOne({
        where: { sku, deletedAt: IsNull() },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException(`SKU "${sku}" is already in use`);
      }
    } else {
      sku = await this.generateUniqueSku({
        categoryName: product.category?.name,
        categoryId: product.categoryId,
      });
    }

    // Append at the end of the variants list by default.
    const maxSort = await this.variantRepo
      .createQueryBuilder('v')
      .select('COALESCE(MAX(v."sortOrder"), -1)', 'max')
      .where('v."productId" = :productId', { productId })
      .getRawOne<{ max: string }>();
    const sortOrder = Number(maxSort?.max ?? -1) + 1;

    // Selling prices are made tax-inclusive on create (flat 7.5%). Cost
    // and compare-at prices are NOT taxed. See tax.util.ts.
    const retailNgn = addSalesTax(dto.retailPriceNgn);
    const retailUsd = addSalesTax(dto.retailPriceUsd);
    const variant = this.variantRepo.create({
      productId,
      sku,
      name: dto.name,
      retailPriceNgn: retailNgn,
      retailPriceUsd: retailUsd,
      wholesalePriceNgn:
        dto.wholesalePriceNgn !== undefined
          ? addSalesTax(dto.wholesalePriceNgn)
          : retailNgn,
      wholesalePriceUsd:
        dto.wholesalePriceUsd !== undefined
          ? addSalesTax(dto.wholesalePriceUsd)
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

  /**
   * Update one variant. PATCH semantics: only keys present in the dto are
   * applied. SKU changes are validated for uniqueness against other
   * active variants.
   */
  async updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ): Promise<ProductVariant> {
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, productId, deletedAt: IsNull() },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found on this product');
    }

    if (dto.sku !== undefined) {
      const newSku = dto.sku.trim().toUpperCase();
      if (newSku !== variant.sku) {
        const taken = await this.variantRepo.findOne({
          where: { sku: newSku, id: Not(variantId), deletedAt: IsNull() },
          select: { id: true },
        });
        if (taken) {
          throw new ConflictException(`SKU "${newSku}" is already in use`);
        }
        variant.sku = newSku;
      }
    }

    // Apply remaining fields. Keep the explicit-field approach (rather
    // than Object.assign) so we never silently accept an unknown prop.
    if (dto.name !== undefined) variant.name = dto.name;
    if (dto.retailPriceNgn !== undefined) variant.retailPriceNgn = dto.retailPriceNgn;
    if (dto.retailPriceUsd !== undefined) variant.retailPriceUsd = dto.retailPriceUsd;
    if (dto.wholesalePriceNgn !== undefined) variant.wholesalePriceNgn = dto.wholesalePriceNgn;
    if (dto.wholesalePriceUsd !== undefined) variant.wholesalePriceUsd = dto.wholesalePriceUsd;
    if (dto.compareAtPriceNgn !== undefined) variant.compareAtPriceNgn = dto.compareAtPriceNgn;
    if (dto.compareAtPriceUsd !== undefined) variant.compareAtPriceUsd = dto.compareAtPriceUsd;
    if (dto.costPriceNgn !== undefined) variant.costPriceNgn = dto.costPriceNgn;
    if (dto.weightKg !== undefined) variant.weightKg = dto.weightKg;
    if (dto.trackInventory !== undefined) variant.trackInventory = dto.trackInventory;
    if (dto.isActive !== undefined) variant.isActive = dto.isActive;
    if (dto.options !== undefined) variant.options = dto.options;
    if (dto.barcode !== undefined) {
      variant.barcode = dto.barcode.trim() || undefined;
    }

    const saved = await this.variantRepo.save(variant);
    await this.cache.invalidateProducts();
    return saved;
  }

  /**
   * Deactivate a variant. Per the locked v1 decision (SCANNER_APP_PLAN
   * §11-style), we don't soft-delete variants — they have FK references
   * from orders, cart items, inventory movements, and POS sessions, and
   * deactivation is the right "hide from new sales" semantic. The row
   * stays visible in the admin (under an "Inactive" affordance) and can
   * be reactivated with a flip of isActive.
   *
   * Refuses to deactivate the LAST active variant on a product — a
   * product with no active variants is invisible everywhere and is more
   * cleanly modelled by deactivating the product itself.
   */
  async deactivateVariant(
    productId: string,
    variantId: string,
  ): Promise<ProductVariant> {
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, productId, deletedAt: IsNull() },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found on this product');
    }
    if (!variant.isActive) {
      return variant; // already inactive — idempotent no-op
    }

    const otherActive = await this.variantRepo.count({
      where: {
        productId,
        id: Not(variantId),
        isActive: true,
        deletedAt: IsNull(),
      },
    });
    if (otherActive === 0) {
      throw new ConflictException({
        error: 'LAST_ACTIVE_VARIANT',
        message:
          'Cannot deactivate the last active variant. Deactivate the product itself, or activate another variant first.',
      });
    }

    variant.isActive = false;
    const saved = await this.variantRepo.save(variant);
    await this.cache.invalidateProducts();
    return saved;
  }

  // ─────────────────────────────────────────────────────────────
  // SKU generation
  // ─────────────────────────────────────────────────────────────

  /**
   * Auto-generate a unique SKU in the format MGN-<6 base32 chars>-<SUFFIX>.
   *
   *  - 32 alphabet, 6 chars → 32^6 ≈ 1.07 billion combinations.
   *  - Each candidate is checked against the DB (including soft-deleted
   *    rows) so we never collide. With retry-on-collision the worst case
   *    is a handful of extra round-trips at 1B+ scale.
   *  - The suffix is derived from the product's primary category (when
   *    present) or defaults to BAG. Always 3 uppercase letters.
   *
   * Example output: MGN-K8R2VQ-BAG
   *
   * Reads existing variant SKUs WITH deleted ones included so a restored
   * variant never duplicates a recycled SKU.
   */
  private async generateUniqueSku(opts: {
    categoryId?: string | null;
    categoryName?: string | null;
  }): Promise<string> {
    const suffix = await this.resolveSkuSuffix(opts);
    // 50 attempts of a 1-in-a-billion collision is overkill but cheap.
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const middle = randomBase32(6);
      const candidate = `MGN-${middle}-${suffix}`;
      const taken = await this.variantRepo.findOne({
        where: { sku: candidate },
        withDeleted: true,
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    // Astronomically unlikely. If it ever happens, surface clearly.
    throw new ConflictException(
      'Failed to generate a unique SKU after 50 attempts',
    );
  }

  /**
   * Suffix derivation. Returns one of a few known abbreviations when
   * the category name contains a recognised keyword (BAG, SHO, BLT,
   * WLT); otherwise the first three letters of the cleaned name
   * uppercased; falls back to BAG.
   *
   * Accepts the category name directly OR a categoryId to look up
   * (used by the create-product path where the Product entity hasn't
   * been persisted yet). Falls back to BAG when nothing's available.
   */
  private async resolveSkuSuffix(opts: {
    categoryId?: string | null;
    categoryName?: string | null;
  }): Promise<string> {
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
      .replace(/[^a-z]/g, ''); // strip punctuation / spaces / digits
    if (!cleaned) return 'BAG';
    if (cleaned.includes('bag')) return 'BAG';
    if (cleaned.includes('shoe')) return 'SHO';
    if (cleaned.includes('belt')) return 'BLT';
    if (cleaned.includes('wallet')) return 'WLT';
    if (cleaned.length >= 3) return cleaned.slice(0, 3).toUpperCase();
    return (cleaned.toUpperCase() + 'XXX').slice(0, 3);
  }
}

/**
 * Crockford base32 random string. Uses crypto-grade randomness from
 * node:crypto. The Crockford alphabet (no I, L, O, U) is human-friendly:
 * the output is safe to read aloud or type without ambiguity. Used by
 * the SKU generator above.
 */
function randomBase32(length: number): string {
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    // Modulo bias is negligible at 8-bit → 32 (256 % 32 === 0, in fact).
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}
