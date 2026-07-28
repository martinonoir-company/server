import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Product, ProductVariant } from '../../products/entities/product.entity';
export declare class CartItem extends BaseEntity {
    userId: string;
    user: User;
    variantId: string | null;
    variant?: ProductVariant | null;
    productId: string | null;
    product?: Product | null;
    quantity: number;
    productName: string;
    productSlug: string;
    variantName?: string | null;
    sku: string;
    priceNgn: number;
    priceUsd: number;
    options?: Record<string, string> | null;
    imageUrl?: string | null;
    isWholesale: boolean;
}
