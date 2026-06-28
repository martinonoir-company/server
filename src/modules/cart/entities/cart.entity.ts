import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Product, ProductVariant } from '../../products/entities/product.entity';

/**
 * Server-persisted cart row for an authenticated user.
 *
 * Snapshots (productName, priceNgn/Usd, imageUrl, …) are captured at add-time
 * so the cart keeps rendering even if the underlying product/variant is later
 * renamed or deleted. Authoritative pricing for checkout still comes from
 * `POST /orders/quote` — these snapshots are display-only.
 *
 * Unique (userId, variantId) prevents duplicate rows for the same variant.
 * FK cascade on user ensures a deleted account cleans up its cart.
 * FK on variant is SET NULL so we can still show a "no longer available" row
 * if admin hard-deletes the variant before the user checks out.
 */
@Entity('cart_items')
// A variant can appear twice in one cart: once retail, once wholesale. The
// wholesale flag is therefore part of the row identity.
@Unique('UQ_cart_user_variant', ['userId', 'variantId', 'isWholesale'])
export class CartItem extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'varchar', length: 26, nullable: true })
  variantId!: string | null;

  @ManyToOne(() => ProductVariant, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'variantId' })
  variant?: ProductVariant | null;

  @Column({ type: 'varchar', length: 26, nullable: true })
  productId!: string | null;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'productId' })
  product?: Product | null;

  @Column({ type: 'int' })
  quantity!: number;

  // ── Snapshots (display-only; re-quote on checkout) ──

  @Column({ type: 'varchar', length: 200 })
  productName!: string;

  @Column({ type: 'varchar', length: 200 })
  productSlug!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  variantName?: string | null;

  @Column({ type: 'varchar', length: 100 })
  sku!: string;

  /** Retail price in NGN minor units (kobo) captured at add-time */
  @Column({ type: 'bigint' })
  priceNgn!: number;

  /** Retail price in USD minor units (cents) captured at add-time */
  @Column({ type: 'bigint' })
  priceUsd!: number;

  @Column({ type: 'jsonb', nullable: true })
  options?: Record<string, string> | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl?: string | null;

  /**
   * True when this line is a wholesale purchase: priced at the variant's
   * wholesale price and subject to the wholesale minimum quantity. Defaults
   * to false (retail). Part of the row's unique key so retail + wholesale of
   * the same variant coexist.
   */
  @Column({ type: 'boolean', default: false })
  isWholesale!: boolean;
}
