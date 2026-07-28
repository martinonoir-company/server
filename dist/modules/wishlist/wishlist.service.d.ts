import { Repository } from 'typeorm';
import { WishlistItem } from './entities/wishlist.entity';
export declare class WishlistService {
    private readonly wishlistRepo;
    constructor(wishlistRepo: Repository<WishlistItem>);
    addItem(userId: string, productId: string, variantId?: string, note?: string): Promise<WishlistItem>;
    removeItem(userId: string, productId: string): Promise<void>;
    getUserWishlist(userId: string): Promise<WishlistItem[]>;
    isWishlisted(userId: string, productId: string): Promise<boolean>;
    getWishlistedProductIds(userId: string, productIds: string[]): Promise<string[]>;
    getCount(userId: string): Promise<number>;
    clearWishlist(userId: string): Promise<void>;
}
