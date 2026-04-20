import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { CartItem } from './entities/cart.entity';
import {
  Product,
  ProductVariant,
  ProductMedia,
} from '../products/entities/product.entity';

export interface CartItemView {
  id: string;
  variantId: string | null;
  productId: string | null;
  productName: string;
  productSlug: string;
  variantName: string | null;
  sku: string;
  quantity: number;
  /** Snapshot price at time of add. */
  priceNgn: number;
  priceUsd: number;
  /** Current live price from the DB. `null` when the variant has been removed. */
  currentPriceNgn: number | null;
  currentPriceUsd: number | null;
  /** true if either currency's current price differs from the snapshot. */
  priceChanged: boolean;
  /** true if the variant was deleted or the product/variant is inactive. */
  unavailable: boolean;
  options: Record<string, string> | null;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CartItem)
    private readonly cartRepo: Repository<CartItem>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductMedia)
    private readonly mediaRepo: Repository<ProductMedia>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Return the user's cart, enriched with live prices and availability flags.
   * The response shape is what the frontend renders directly.
   */
  async getCart(userId: string): Promise<CartItemView[]> {
    const rows = await this.cartRepo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });

    if (rows.length === 0) return [];

    const variantIds = rows
      .map((r) => r.variantId)
      .filter((v): v is string => typeof v === 'string' && v.length > 0);

    const liveVariants = variantIds.length
      ? await this.variantRepo.find({
          where: { id: In(variantIds) },
        })
      : [];
    const byVariantId = new Map(liveVariants.map((v) => [v.id, v]));

    const productIds = Array.from(
      new Set(liveVariants.map((v) => v.productId).filter(Boolean)),
    );
    const liveProducts = productIds.length
      ? await this.productRepo.find({ where: { id: In(productIds) } })
      : [];
    const byProductId = new Map(liveProducts.map((p) => [p.id, p]));

    return rows.map((row) => this.toView(row, byVariantId, byProductId));
  }

  async getCount(userId: string): Promise<number> {
    const { sum } = await this.cartRepo
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.quantity), 0)', 'sum')
      .where('c.userId = :userId', { userId })
      .getRawOne<{ sum: string }>() ?? { sum: '0' };
    return Number(sum ?? 0);
  }

  /**
   * Add (or increment) a variant in the user's cart.
   *
   * Uses a DB transaction + `UQ_cart_user_variant` unique constraint so two
   * concurrent adds of the same variant can't race into two rows.
   */
  async addItem(
    userId: string,
    variantId: string,
    quantity: number,
  ): Promise<CartItemView> {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('quantity must be a positive integer');
    }

    const { variant, product, imageUrl } = await this.loadVariantOrThrow(
      variantId,
    );

    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CartItem);
      const existing = await repo.findOne({ where: { userId, variantId } });
      if (existing) {
        existing.quantity = existing.quantity + quantity;
        // Refresh the snapshot so display stays close to current truth.
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
      });
      return repo.save(fresh);
    });

    return this.toView(
      saved,
      new Map([[variant.id, variant]]),
      new Map([[product.id, product]]),
    );
  }

  /**
   * Set absolute quantity for a variant already in the cart.
   * `quantity === 0` removes the row, matching the local-cart context.
   */
  async updateQuantity(
    userId: string,
    variantId: string,
    quantity: number,
  ): Promise<CartItemView | null> {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new BadRequestException('quantity must be >= 0');
    }

    const row = await this.cartRepo.findOne({ where: { userId, variantId } });
    if (!row) throw new NotFoundException('Cart item not found');

    if (quantity === 0) {
      await this.cartRepo.delete(row.id);
      return null;
    }

    row.quantity = quantity;
    const saved = await this.cartRepo.save(row);
    return this.hydrateOne(saved);
  }

  async removeItem(userId: string, variantId: string): Promise<void> {
    const result = await this.cartRepo.delete({ userId, variantId });
    if (result.affected === 0) {
      throw new NotFoundException('Cart item not found');
    }
  }

  async clearCart(userId: string): Promise<void> {
    await this.cartRepo.delete({ userId });
  }

  /**
   * Merge a guest cart (from localStorage) into the user's server cart on
   * login. Each entry's quantity is added on top of any existing quantity
   * for the same variant. Invalid/missing variants are silently skipped so a
   * stale local cart never blocks login.
   */
  async mergeCart(
    userId: string,
    entries: { variantId: string; quantity: number }[],
  ): Promise<CartItemView[]> {
    const safe = entries.filter(
      (e) =>
        typeof e.variantId === 'string' &&
        e.variantId.length > 0 &&
        Number.isInteger(e.quantity) &&
        e.quantity > 0,
    );

    if (safe.length === 0) return this.getCart(userId);

    // Collapse duplicates the client might have sent.
    const byVariant = new Map<string, number>();
    for (const e of safe) {
      byVariant.set(e.variantId, (byVariant.get(e.variantId) ?? 0) + e.quantity);
    }

    const variantIds = Array.from(byVariant.keys());
    const variants = await this.variantRepo.find({
      where: { id: In(variantIds), isActive: true },
    });
    const products = variants.length
      ? await this.productRepo.find({
          where: { id: In(Array.from(new Set(variants.map((v) => v.productId)))) },
        })
      : [];
    const productById = new Map(products.map((p) => [p.id, p]));
    const mediaRows = products.length
      ? await this.mediaRepo.find({
          where: { productId: In(products.map((p) => p.id)) },
          order: { sortOrder: 'ASC' },
        })
      : [];
    const firstImageByProduct = new Map<string, string>();
    for (const m of mediaRows) {
      if (m.mediaType === 'IMAGE' && !firstImageByProduct.has(m.productId)) {
        firstImageByProduct.set(m.productId, m.url);
      }
    }

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CartItem);
      for (const variant of variants) {
        const product = productById.get(variant.productId);
        if (!product || !product.isActive) continue;
        const addQty = byVariant.get(variant.id) ?? 0;
        if (addQty <= 0) continue;

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
          existing.imageUrl = firstImageByProduct.get(product.id) ?? existing.imageUrl;
          await repo.save(existing);
        } else {
          await repo.save(
            repo.create({
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
              imageUrl: firstImageByProduct.get(product.id) ?? null,
            }),
          );
        }
      }
    });

    return this.getCart(userId);
  }

  // ── internals ──

  private async loadVariantOrThrow(variantId: string): Promise<{
    variant: ProductVariant;
    product: Product;
    imageUrl: string | null;
  }> {
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, isActive: true },
    });
    if (!variant) throw new NotFoundException('Variant not found');

    const product = await this.productRepo.findOne({
      where: { id: variant.productId },
    });
    if (!product || !product.isActive) {
      throw new BadRequestException('Product is not available');
    }

    const firstImage = await this.mediaRepo.findOne({
      where: { productId: product.id, mediaType: 'IMAGE' },
      order: { sortOrder: 'ASC' },
    });

    return { variant, product, imageUrl: firstImage?.url ?? null };
  }

  private async hydrateOne(row: CartItem): Promise<CartItemView> {
    const variant = row.variantId
      ? await this.variantRepo.findOne({ where: { id: row.variantId } })
      : null;
    const product = variant
      ? await this.productRepo.findOne({ where: { id: variant.productId } })
      : null;
    return this.toView(
      row,
      new Map(variant ? [[variant.id, variant]] : []),
      new Map(product ? [[product.id, product]] : []),
    );
  }

  private toView(
    row: CartItem,
    byVariantId: Map<string, ProductVariant>,
    byProductId: Map<string, Product>,
  ): CartItemView {
    const liveVariant = row.variantId ? byVariantId.get(row.variantId) : null;
    const liveProduct = liveVariant
      ? byProductId.get(liveVariant.productId)
      : null;

    const variantExists = !!liveVariant;
    const unavailable =
      !variantExists ||
      !liveVariant!.isActive ||
      !liveProduct ||
      !liveProduct.isActive;

    const currentPriceNgn = liveVariant ? Number(liveVariant.retailPriceNgn) : null;
    const currentPriceUsd = liveVariant ? Number(liveVariant.retailPriceUsd) : null;

    const snapshotNgn = Number(row.priceNgn);
    const snapshotUsd = Number(row.priceUsd);

    const priceChanged =
      variantExists &&
      (currentPriceNgn !== snapshotNgn || currentPriceUsd !== snapshotUsd);

    return {
      id: row.id,
      variantId: row.variantId,
      productId: row.productId,
      productName: liveProduct?.name ?? row.productName,
      productSlug: liveProduct?.slug ?? row.productSlug,
      variantName: liveVariant?.name ?? row.variantName ?? null,
      sku: liveVariant?.sku ?? row.sku,
      quantity: row.quantity,
      priceNgn: snapshotNgn,
      priceUsd: snapshotUsd,
      currentPriceNgn,
      currentPriceUsd,
      priceChanged,
      unavailable,
      options: (liveVariant?.options ?? row.options) ?? null,
      imageUrl: row.imageUrl ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
