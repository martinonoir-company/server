import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis-backed cache service for the commerce platform.
 *
 * Caching strategy (standard e-commerce):
 * - Product listings:  5 min TTL  (frequently browsed, tolerate slight staleness)
 * - Product detail:    10 min TTL (individual pages, cache-heavy)
 * - Category tree:     30 min TTL (rarely changes)
 * - Search results:    2 min TTL  (frequent variations)
 *
 * Write-through invalidation: mutations (create/update/delete) flush
 * affected cache keys so the next read rebuilds from DB.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client!: Redis;

  /** Default TTL in seconds */
  static readonly TTL = {
    PRODUCT_LIST: 300,     // 5 min
    PRODUCT_DETAIL: 600,   // 10 min
    CATEGORY_LIST: 1800,   // 30 min
    SEARCH: 120,           // 2 min
    WISHLIST: 300,         // 5 min
    STOCK_LEVEL: 30,       // 30 sec — near real-time
    POS_CATALOG: 300,      // 5 min — product list for POS
  } as const;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = this.config.get('REDIS_HOST', 'localhost');
    const port = this.config.get<number>('REDIS_PORT', 6379);

    this.client = new Redis({
      host,
      port,
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

  private get isReady(): boolean {
    return this.client?.status === 'ready';
  }

  // ── Core Operations ──

  /**
   * Get a cached value. Returns null on miss or Redis unavailability.
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isReady) return null;
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /**
   * Set a value with TTL (seconds).
   */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.isReady) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Cache write failure is non-fatal
    }
  }

  /**
   * Delete a specific key.
   */
  async del(key: string): Promise<void> {
    if (!this.isReady) return;
    try {
      await this.client.del(key);
    } catch {
      // Ignore
    }
  }

  /**
   * Delete all keys matching a pattern.
   * Uses SCAN (non-blocking) instead of KEYS.
   */
  async delPattern(pattern: string): Promise<void> {
    if (!this.isReady) return;
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      } while (cursor !== '0');
    } catch {
      // Ignore
    }
  }

  // ── E-Commerce Cache Keys ──

  /** Product list cache key (includes pagination + filters hash) */
  static productListKey(params: Record<string, unknown>): string {
    const hash = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return `products:list:${hash}`;
  }

  static productDetailKey(slug: string): string {
    return `products:detail:${slug}`;
  }

  static productDetailByIdKey(id: string): string {
    return `products:id:${id}`;
  }

  static categoryListKey(): string {
    return 'categories:list';
  }

  static categoryTreeKey(): string {
    return 'categories:tree';
  }

  static categorySlugKey(slug: string): string {
    return `categories:slug:${slug}`;
  }

  // ── Stock Cache Keys ──

  static stockLevelKey(variantId: string, warehouseCode = 'DEFAULT'): string {
    return `stock:level:${variantId}:${warehouseCode}`;
  }

  static stockLevelsAllKey(): string {
    return 'stock:levels:all';
  }

  // ── Invalidation Helpers ──

  /** Flush all product caches (on product create/update/delete) */
  async invalidateProducts(): Promise<void> {
    await this.delPattern('products:*');
  }

  /** Flush all category caches */
  async invalidateCategories(): Promise<void> {
    await this.delPattern('categories:*');
  }

  /** Flush stock caches for a specific variant (or all stock) */
  async invalidateStock(variantId?: string): Promise<void> {
    if (variantId) {
      await this.delPattern(`stock:level:${variantId}:*`);
    }
    await this.del(CacheService.stockLevelsAllKey());
  }
}
