import { Repository, DataSource } from 'typeorm';
import { CartItem } from './entities/cart.entity';
import { Product, ProductVariant, ProductMedia } from '../products/entities/product.entity';
export interface CartItemView {
    id: string;
    variantId: string | null;
    productId: string | null;
    productName: string;
    productSlug: string;
    variantName: string | null;
    sku: string;
    quantity: number;
    priceNgn: number;
    priceUsd: number;
    retailPriceNgn: number;
    retailPriceUsd: number;
    currentPriceNgn: number | null;
    currentPriceUsd: number | null;
    priceChanged: boolean;
    unavailable: boolean;
    options: Record<string, string> | null;
    imageUrl: string | null;
    isWholesale: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare class CartService {
    private readonly cartRepo;
    private readonly variantRepo;
    private readonly productRepo;
    private readonly mediaRepo;
    private readonly dataSource;
    constructor(cartRepo: Repository<CartItem>, variantRepo: Repository<ProductVariant>, productRepo: Repository<Product>, mediaRepo: Repository<ProductMedia>, dataSource: DataSource);
    getCart(userId: string): Promise<CartItemView[]>;
    getCount(userId: string): Promise<number>;
    addItem(userId: string, variantId: string, quantity: number, isWholesale?: boolean): Promise<CartItemView>;
    updateQuantity(userId: string, variantId: string, quantity: number): Promise<CartItemView | null>;
    removeItem(userId: string, variantId: string): Promise<void>;
    clearCart(userId: string): Promise<void>;
    mergeCart(userId: string, entries: {
        variantId: string;
        quantity: number;
    }[]): Promise<CartItemView[]>;
    private loadVariantOrThrow;
    private hydrateOne;
    private toView;
}
