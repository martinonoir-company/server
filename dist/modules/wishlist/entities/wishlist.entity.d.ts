import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Product } from '../../products/entities/product.entity';
import { ProductVariant } from '../../products/entities/product.entity';
export declare class WishlistItem extends BaseEntity {
    userId: string;
    user: User;
    productId: string;
    product: Product;
    variantId?: string;
    variant?: ProductVariant;
    note?: string;
}
