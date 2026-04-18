import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Product } from '../../products/entities/product.entity';
import { ProductVariant } from '../../products/entities/product.entity';

/**
 * Wishlist item — tracks products a user has saved for later.
 * Unique constraint on (userId, productId) prevents duplicates.
 */
@Entity('wishlist_items')
@Unique('UQ_wishlist_user_product', ['userId', 'productId'])
export class WishlistItem extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'varchar', length: 26 })
  productId!: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  /** Optional: preferred variant (if user selected one before wishlisting) */
  @Column({ type: 'varchar', length: 26, nullable: true })
  variantId?: string;

  @ManyToOne(() => ProductVariant, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'variantId' })
  variant?: ProductVariant;

  /** Optional note from the user */
  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string;
}
