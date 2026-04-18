import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WishlistItem } from './entities/wishlist.entity';

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(WishlistItem) private readonly wishlistRepo: Repository<WishlistItem>,
  ) {}

  /**
   * Add a product to the user's wishlist.
   * Idempotent — returns existing item if already wishlisted.
   */
  async addItem(userId: string, productId: string, variantId?: string, note?: string): Promise<WishlistItem> {
    const existing = await this.wishlistRepo.findOne({
      where: { userId, productId },
    });

    if (existing) {
      // Update variant/note if provided
      if (variantId !== undefined) existing.variantId = variantId;
      if (note !== undefined) existing.note = note;
      return this.wishlistRepo.save(existing);
    }

    const item = this.wishlistRepo.create({ userId, productId, variantId, note });
    return this.wishlistRepo.save(item);
  }

  /**
   * Remove a product from the user's wishlist.
   */
  async removeItem(userId: string, productId: string): Promise<void> {
    const item = await this.wishlistRepo.findOne({ where: { userId, productId } });
    if (!item) {
      throw new NotFoundException('Item not in wishlist');
    }
    await this.wishlistRepo.remove(item);
  }

  /**
   * Get all wishlist items for a user, with product and variant relations.
   */
  async getUserWishlist(userId: string): Promise<WishlistItem[]> {
    return this.wishlistRepo.find({
      where: { userId },
      relations: ['product', 'product.variants', 'product.media', 'product.category', 'variant'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Check if a specific product is in the user's wishlist.
   */
  async isWishlisted(userId: string, productId: string): Promise<boolean> {
    const count = await this.wishlistRepo.count({ where: { userId, productId } });
    return count > 0;
  }

  /**
   * Batch check: which of these productIds are in the user's wishlist?
   */
  async getWishlistedProductIds(userId: string, productIds: string[]): Promise<string[]> {
    if (productIds.length === 0) return [];

    const items = await this.wishlistRepo
      .createQueryBuilder('w')
      .select('w.productId')
      .where('w.userId = :userId', { userId })
      .andWhere('w.productId IN (:...productIds)', { productIds })
      .getMany();

    return items.map((i) => i.productId);
  }

  /**
   * Get wishlist item count for a user.
   */
  async getCount(userId: string): Promise<number> {
    return this.wishlistRepo.count({ where: { userId } });
  }

  /**
   * Clear entire wishlist for a user.
   */
  async clearWishlist(userId: string): Promise<void> {
    await this.wishlistRepo.delete({ userId });
  }
}
