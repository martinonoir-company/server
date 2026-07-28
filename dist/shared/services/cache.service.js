"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var CacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = __importDefault(require("ioredis"));
let CacheService = CacheService_1 = class CacheService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(CacheService_1.name);
    }
    onModuleInit() {
        const host = this.config.get('REDIS_HOST', 'localhost');
        const port = this.config.get('REDIS_PORT', 6379);
        const username = this.config.get('REDIS_USERNAME') || undefined;
        const password = this.config.get('REDIS_PASSWORD') || undefined;
        this.client = new ioredis_1.default({
            host,
            port,
            username,
            password,
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => Math.min(times * 200, 3000),
            lazyConnect: true,
        });
        this.client.on('error', (err) => {
            this.logger.warn(`Redis connection error (cache degrades gracefully): ${err.message}`);
        });
        this.client.connect().catch((err) => {
            this.logger.warn(`Redis unavailable — running without cache: ${err.message}`);
        });
    }
    onModuleDestroy() {
        return this.client?.quit();
    }
    get isReady() {
        return this.client?.status === 'ready';
    }
    async get(key) {
        if (!this.isReady)
            return null;
        try {
            const raw = await this.client.get(key);
            if (!raw)
                return null;
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    async set(key, value, ttlSeconds) {
        if (!this.isReady)
            return;
        try {
            await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        }
        catch {
        }
    }
    async del(key) {
        if (!this.isReady)
            return;
        try {
            await this.client.del(key);
        }
        catch {
        }
    }
    async delPattern(pattern) {
        if (!this.isReady)
            return;
        try {
            let cursor = '0';
            do {
                const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
                cursor = nextCursor;
                if (keys.length > 0) {
                    await this.client.del(...keys);
                }
            } while (cursor !== '0');
        }
        catch {
        }
    }
    static productListKey(params) {
        const hash = Object.entries(params)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('&');
        return `products:list:${hash}`;
    }
    static productDetailKey(slug) {
        return `products:detail:${slug}`;
    }
    static productDetailByIdKey(id) {
        return `products:id:${id}`;
    }
    static categoryListKey() {
        return 'categories:list';
    }
    static categoryTreeKey() {
        return 'categories:tree';
    }
    static categorySlugKey(slug) {
        return `categories:slug:${slug}`;
    }
    static stockLevelKey(variantId, warehouseCode = 'DEFAULT') {
        return `stock:level:${variantId}:${warehouseCode}`;
    }
    static stockLevelsAllKey() {
        return 'stock:levels:all';
    }
    async invalidateProducts() {
        await this.delPattern('products:*');
    }
    async invalidateCategories() {
        await this.delPattern('categories:*');
    }
    async invalidateStock(variantId) {
        if (variantId) {
            await this.delPattern(`stock:level:${variantId}:*`);
        }
        await this.del(CacheService_1.stockLevelsAllKey());
    }
};
exports.CacheService = CacheService;
CacheService.TTL = {
    PRODUCT_LIST: 300,
    PRODUCT_DETAIL: 600,
    CATEGORY_LIST: 1800,
    SEARCH: 120,
    WISHLIST: 300,
    STOCK_LEVEL: 30,
    POS_CATALOG: 300,
};
exports.CacheService = CacheService = CacheService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], CacheService);
//# sourceMappingURL=cache.service.js.map