import { CartService } from './cart.service';
import { User } from '../users/entities/user.entity';
import { AddCartItemDto, UpdateCartQuantityDto, MergeCartDto } from './dto/cart.dto';
export declare class CartController {
    private readonly cartService;
    constructor(cartService: CartService);
    getCart(user: User): Promise<{
        data: import("./cart.service").CartItemView[];
    }>;
    getCount(user: User): Promise<{
        data: {
            count: number;
        };
    }>;
    addItem(user: User, dto: AddCartItemDto): Promise<{
        data: import("./cart.service").CartItemView;
    }>;
    updateQuantity(user: User, variantId: string, dto: UpdateCartQuantityDto): Promise<{
        data: import("./cart.service").CartItemView | null;
    }>;
    removeItem(user: User, variantId: string): Promise<{
        message: string;
    }>;
    clearCart(user: User): Promise<{
        message: string;
    }>;
    mergeCart(user: User, dto: MergeCartDto): Promise<{
        data: import("./cart.service").CartItemView[];
    }>;
}
