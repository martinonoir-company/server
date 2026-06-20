import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { Category } from './category.entity';

// ── Product ──

@Entity('products')
export class Product extends BaseEntity {
  @Column({ type: 'varchar', length: 300 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 350 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: true })
  shortDescription?: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', default: false })
  isFeatured!: boolean;

  @Column({ type: 'varchar', length: 26, nullable: true })
  categoryId?: string;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category?: Category;

  @OneToMany(() => ProductVariant, (v) => v.product, { cascade: true })
  variants!: ProductVariant[];

  @OneToMany(() => ProductMedia, (m) => m.product, { cascade: true })
  media!: ProductMedia[];

  @Column({ type: 'jsonb', nullable: true })
  attributes?: Record<string, string>;

  // ── SEO ──
  @Column({ type: 'varchar', length: 200, nullable: true })
  metaTitle?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  metaDescription?: string;

  @Column({ type: 'simple-array', nullable: true })
  tags?: string[];
}

// ── Variant (SKU) ──

@Entity('product_variants')
export class ProductVariant extends BaseEntity {
  @Column({ type: 'varchar', length: 26 })
  productId!: string;

  @ManyToOne(() => Product, (p) => p.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  sku!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  name?: string;

  /** Retail price in NGN minor units (kobo) — used on storefront & mobile */
  @Column({ type: 'bigint' })
  retailPriceNgn!: number;

  /** Retail price in USD minor units (cents) — used on storefront & mobile */
  @Column({ type: 'bigint' })
  retailPriceUsd!: number;

  /** Wholesale price in NGN minor units (kobo) — used on POS & admin */
  @Column({ type: 'bigint' })
  wholesalePriceNgn!: number;

  /** Wholesale price in USD minor units (cents) — used on POS & admin */
  @Column({ type: 'bigint' })
  wholesalePriceUsd!: number;

  /** Compare-at price NGN for showing discounts (retail context) */
  @Column({ type: 'bigint', nullable: true })
  compareAtPriceNgn?: number;

  /** Compare-at price USD for showing discounts (retail context) */
  @Column({ type: 'bigint', nullable: true })
  compareAtPriceUsd?: number;

  /** Cost/purchase price NGN (for profit calculation) */
  @Column({ type: 'bigint', nullable: true })
  costPriceNgn?: number;

  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true })
  weightKg?: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', default: true })
  trackInventory!: boolean;

  /** Variant-specific attributes e.g. { color: "Black", size: "M" } */
  @Column({ type: 'jsonb', nullable: true })
  options?: Record<string, string>;

  @Column({ type: 'varchar', length: 100, nullable: true })
  barcode?: string;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;
}

// ── Product Media ──

@Entity('product_media')
@Index(['productId', 'variantId'])
export class ProductMedia extends BaseEntity {
  @Column({ type: 'varchar', length: 26 })
  productId!: string;

  @ManyToOne(() => Product, (p) => p.media, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  /**
   * Optional variant attachment. NULL = the media belongs to the
   * product as a whole (gallery / hero shots that don't depend on a
   * variant choice). Non-NULL = the media is specific to this variant —
   * shown when the user selects this variant on the PDP, and as a
   * thumbnail strip under the main image.
   *
   * Made nullable so the existing product-level rows keep working
   * untouched on the upgrade path.
   */
  @Column({ type: 'varchar', length: 26, nullable: true })
  variantId?: string | null;

  @ManyToOne(() => ProductVariant, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variantId' })
  variant?: ProductVariant | null;

  @Column({ type: 'varchar', length: 1024 })
  url!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  altText?: string;

  @Column({ type: 'enum', enum: ['IMAGE', 'VIDEO'], default: 'IMAGE' })
  mediaType!: 'IMAGE' | 'VIDEO';

  /**
   * Ordering inside a (productId, variantId) bucket. The list API
   * sorts by (variantId NULLS FIRST, sortOrder) so product-level
   * media is naturally listed before any variant-scoped media.
   */
  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  /** Generated sizes for responsive images */
  @Column({ type: 'jsonb', nullable: true })
  sizes?: { width: number; height: number; url: string }[];
}
