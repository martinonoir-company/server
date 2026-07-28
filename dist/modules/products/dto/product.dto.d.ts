export declare class CreateVariantDto {
    name?: string;
    sku?: string;
    retailPriceNgn: number;
    retailPriceUsd: number;
    wholesalePriceNgn?: number;
    wholesalePriceUsd?: number;
    compareAtPriceNgn?: number;
    compareAtPriceUsd?: number;
    costPriceNgn?: number;
    weightKg?: number;
    trackInventory?: boolean;
    isActive?: boolean;
    options?: Record<string, string>;
    barcode?: string;
}
export declare class CreateProductDto {
    name: string;
    description?: string;
    shortDescription?: string;
    categoryId?: string;
    isActive?: boolean;
    isFeatured?: boolean;
    attributes?: Record<string, string>;
    metaTitle?: string;
    metaDescription?: string;
    tags?: string[];
    variants: CreateVariantDto[];
}
export declare class UpdateProductDto {
    name?: string;
    description?: string;
    shortDescription?: string;
    categoryId?: string;
    isActive?: boolean;
    isFeatured?: boolean;
    attributes?: Record<string, string>;
    metaTitle?: string;
    metaDescription?: string;
    tags?: string[];
}
export declare class AddVariantDto {
    name?: string;
    sku?: string;
    retailPriceNgn: number;
    retailPriceUsd: number;
    wholesalePriceNgn?: number;
    wholesalePriceUsd?: number;
    compareAtPriceNgn?: number;
    compareAtPriceUsd?: number;
    costPriceNgn?: number;
    weightKg?: number;
    trackInventory?: boolean;
    isActive?: boolean;
    options?: Record<string, string>;
    barcode?: string;
}
export declare class UpdateVariantDto {
    name?: string;
    sku?: string;
    retailPriceNgn?: number;
    retailPriceUsd?: number;
    wholesalePriceNgn?: number;
    wholesalePriceUsd?: number;
    compareAtPriceNgn?: number;
    compareAtPriceUsd?: number;
    costPriceNgn?: number;
    weightKg?: number;
    trackInventory?: boolean;
    isActive?: boolean;
    options?: Record<string, string>;
    barcode?: string;
}
export declare class ProductQueryDto {
    search?: string;
    categoryId?: string;
    isActive?: boolean;
    isFeatured?: boolean;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
    withDeleted?: boolean;
    deletedOnly?: boolean;
}
export declare class BulkUpdateProductsDto {
    ids: string[];
    isActive?: boolean;
    isFeatured?: boolean;
    categoryId?: string;
}
