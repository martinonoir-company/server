import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto, ProductQueryDto, BulkUpdateProductsDto, AddVariantDto, UpdateVariantDto } from './dto/product.dto';
export declare class ProductsController {
    private readonly productsService;
    constructor(productsService: ProductsService);
    create(dto: CreateProductDto): Promise<{
        data: import("./entities/product.entity").Product;
    }>;
    bulkUpdate(dto: BulkUpdateProductsDto): Promise<{
        data: {
            updated: number;
        };
    }>;
    findAll(query: ProductQueryDto): Promise<{
        data: {
            items: import("./entities/product.entity").Product[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    findBySlug(slug: string): Promise<{
        data: import("./entities/product.entity").Product;
    }>;
    findVariantBySku(code: string): Promise<{
        data: import("./products.service").VariantLookupResult;
    }>;
    findVariantByBarcode(code: string): Promise<{
        data: import("./products.service").VariantLookupResult;
    }>;
    findOne(id: string, withDeleted?: string): Promise<{
        data: import("./entities/product.entity").Product;
    }>;
    update(id: string, dto: UpdateProductDto): Promise<{
        data: import("./entities/product.entity").Product;
    }>;
    remove(id: string): Promise<void>;
    restore(id: string): Promise<{
        data: import("./entities/product.entity").Product;
    }>;
    addVariant(productId: string, dto: AddVariantDto): Promise<{
        data: import("./entities/product.entity").ProductVariant;
    }>;
    updateVariant(productId: string, variantId: string, dto: UpdateVariantDto): Promise<{
        data: import("./entities/product.entity").ProductVariant;
    }>;
    deactivateVariant(productId: string, variantId: string): Promise<{
        data: import("./entities/product.entity").ProductVariant;
    }>;
}
