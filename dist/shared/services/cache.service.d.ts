import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class CacheService implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly logger;
    private client;
    static readonly TTL: {
        readonly PRODUCT_LIST: 300;
        readonly PRODUCT_DETAIL: 600;
        readonly CATEGORY_LIST: 1800;
        readonly SEARCH: 120;
        readonly WISHLIST: 300;
        readonly STOCK_LEVEL: 30;
        readonly POS_CATALOG: 300;
    };
    constructor(config: ConfigService);
    onModuleInit(): void;
    onModuleDestroy(): Promise<"OK">;
    private get isReady();
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
    del(key: string): Promise<void>;
    delPattern(pattern: string): Promise<void>;
    static productListKey(params: Record<string, unknown>): string;
    static productDetailKey(slug: string): string;
    static productDetailByIdKey(id: string): string;
    static categoryListKey(): string;
    static categoryTreeKey(): string;
    static categorySlugKey(slug: string): string;
    static stockLevelKey(variantId: string, warehouseCode?: string): string;
    static stockLevelsAllKey(): string;
    invalidateProducts(): Promise<void>;
    invalidateCategories(): Promise<void>;
    invalidateStock(variantId?: string): Promise<void>;
}
