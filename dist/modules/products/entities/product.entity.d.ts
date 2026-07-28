import { BaseEntity } from '../../../shared/entities/base.entity';
import { Category } from './category.entity';
export declare class Product extends BaseEntity {
    name: string;
    slug: string;
    description?: string;
    shortDescription?: string;
    isActive: boolean;
    isFeatured: boolean;
    categoryId?: string;
    category?: Category;
    variants: ProductVariant[];
    media: ProductMedia[];
    attributes?: Record<string, string>;
    metaTitle?: string;
    metaDescription?: string;
    tags?: string[];
}
export declare class ProductVariant extends BaseEntity {
    productId: string;
    product: Product;
    sku: string;
    name?: string;
    retailPriceNgn: number;
    retailPriceUsd: number;
    wholesalePriceNgn: number;
    wholesalePriceUsd: number;
    compareAtPriceNgn?: number;
    compareAtPriceUsd?: number;
    costPriceNgn?: number;
    weightKg?: number;
    isActive: boolean;
    trackInventory: boolean;
    options?: Record<string, string>;
    barcode?: string;
    sortOrder: number;
}
export declare class ProductMedia extends BaseEntity {
    productId: string;
    product: Product;
    variantId?: string | null;
    variant?: ProductVariant | null;
    url: string;
    altText?: string;
    mediaType: 'IMAGE' | 'VIDEO';
    sortOrder: number;
    sizes?: {
        width: number;
        height: number;
        url: string;
    }[];
}
