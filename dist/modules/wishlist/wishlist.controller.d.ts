import { WishlistService } from './wishlist.service';
import { User } from '../users/entities/user.entity';
declare class AddToWishlistDto {
    productId: string;
    variantId?: string;
    note?: string;
}
export declare class WishlistController {
    private readonly wishlistService;
    constructor(wishlistService: WishlistService);
    getWishlist(user: User): Promise<{
        data: import("./entities/wishlist.entity").WishlistItem[];
    }>;
    getCount(user: User): Promise<{
        data: {
            count: number;
        };
    }>;
    checkWishlisted(user: User, productIds: string): Promise<{
        data: {
            wishlisted: string[];
        };
    }>;
    addItem(user: User, dto: AddToWishlistDto): Promise<{
        data: import("./entities/wishlist.entity").WishlistItem;
    }>;
    removeItem(user: User, productId: string): Promise<{
        message: string;
    }>;
    clearWishlist(user: User): Promise<{
        message: string;
    }>;
}
export {};
