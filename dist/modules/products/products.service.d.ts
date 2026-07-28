import { Repository } from 'typeorm';
import { Product, ProductVariant, ProductMedia } from './entities/product.entity';
import { Category } from './entities/category.entity';
import { CreateProductDto, UpdateProductDto, ProductQueryDto, BulkUpdateProductsDto, AddVariantDto, UpdateVariantDto } from './dto/product.dto';
import { CacheService } from '../../shared/services/cache.service';
export interface VariantLookupResult {
    id: string;
    productId: string;
    productName: string;
    productSlug: string;
    variantName: string | null;
    sku: string;
    barcode: string | null;
    price: {
        retailNgn: string;
        retailUsd: string;
        wholesaleNgn: string;
        wholesaleUsd: string;
    };
    options: Record<string, string> | null;
    imageUrl: string | null;
    isActive: boolean;
}
export declare class ProductsService {
    private readonly productRepo;
    private readonly variantRepo;
    private readonly mediaRepo;
    private readonly categoryRepo;
    private readonly cache;
    constructor(productRepo: Repository<Product>, variantRepo: Repository<ProductVariant>, mediaRepo: Repository<ProductMedia>, categoryRepo: Repository<Category>, cache: CacheService);
    create(dto: CreateProductDto): Promise<Product>;
    findAll(query: ProductQueryDto): Promise<{
        items: Product[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    private searchAll;
    private withActiveVariantsOnly;
    findOne(id: string, opts?: {
        withDeleted?: boolean;
    }): Promise<Product>;
    findBySlug(slug: string): Promise<Product>;
    findVariantBySku(sku: string): Promise<VariantLookupResult>;
    findVariantByBarcode(barcode: string): Promise<VariantLookupResult>;
    private runVariantLookup;
    update(id: string, dto: UpdateProductDto): Promise<Product>;
    bulkUpdate(dto: BulkUpdateProductsDto): Promise<{
        updated: number;
    }>;
    remove(id: string): Promise<void>;
    restore(id: string): Promise<Product>;
    private slugify;
    private generateUniqueSlug;
    addVariantToProduct(productId: string, dto: AddVariantDto): Promise<ProductVariant>;
    updateVariant(productId: string, variantId: string, dto: UpdateVariantDto): Promise<ProductVariant>;
    deactivateVariant(productId: string, variantId: string): Promise<ProductVariant>;
    private generateUniqueSku;
    private resolveSkuSuffix;
}
