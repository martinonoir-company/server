import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { StockMovement, StockLevel, MovementKind } from './entities/inventory.entity';
import { CacheService } from '../../shared/services/cache.service';

/** Kinds that increase on-hand stock */
const INBOUND_KINDS = new Set<MovementKind>([
  MovementKind.RECEIPT,
  MovementKind.RETURN,
  MovementKind.TRANSFER_IN,
]);

/** Kinds that decrease on-hand stock */
const OUTBOUND_KINDS = new Set<MovementKind>([
  MovementKind.SALE,
  MovementKind.ADJUSTMENT,
  MovementKind.TRANSFER_OUT,
]);

export interface RecordMovementInput {
  variantId: string;
  kind: MovementKind;
  quantity: number;
  warehouseCode?: string;
  referenceId?: string;
  referenceType?: string;
  reason?: string;
  createdBy?: string;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(StockMovement)
    private readonly movementRepo: Repository<StockMovement>,
    @InjectRepository(StockLevel)
    private readonly levelRepo: Repository<StockLevel>,
    private readonly dataSource: DataSource,
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  /**
   * Record a stock movement and update the materialised level.
   *
   * Concurrency strategy:
   *   - Outbound:  UPDATE ... SET "onHand" = "onHand" - :qty WHERE "onHand" >= :qty
   *   - Inbound:   UPDATE ... SET "onHand" = "onHand" + :qty
   *   - Reserve:   UPDATE ... SET "reserved" = "reserved" + :qty WHERE ("onHand" - "reserved") >= :qty
   *   - Release:   UPDATE ... SET "reserved" = GREATEST(0, "reserved" - :qty)
   *
   * No SERIALIZABLE isolation. No pessimistic locks.
   * The conditional WHERE clause guarantees atomicity and prevents overselling.
   *
   * Idempotency:
   *   If referenceId + referenceType + variantId + kind already exists,
   *   the original movement is returned and no stock change occurs.
   */
  async recordMovement(input: RecordMovementInput): Promise<StockMovement> {
    if (input.quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }

    const warehouse = input.warehouseCode ?? 'DEFAULT';

    // ── 1. IDEMPOTENCY CHECK ──
    if (input.referenceId && input.referenceType) {
      const existing = await this.movementRepo.findOne({
        where: {
          referenceId: input.referenceId,
          referenceType: input.referenceType,
          variantId: input.variantId,
          kind: input.kind,
        },
      });
      if (existing) {
        this.logger.debug(
          `Idempotent skip: ${input.kind} for variant=${input.variantId} ref=${input.referenceId}`,
        );
        return existing;
      }
    }

    // ── 2–4: TRANSACTION (READ COMMITTED — no serializable, no locks) ──
    // Wrapping upsert + conditional update + movement insert in one transaction
    // ensures that if the movement insert fails (e.g. duplicate via unique index),
    // the stock level change is rolled back automatically.
    const movement = await this.dataSource.transaction(async (manager) => {
      // 2. ENSURE StockLevel ROW EXISTS (upsert)
      await manager
        .createQueryBuilder()
        .insert()
        .into(StockLevel)
        .values({
          variantId: input.variantId,
          warehouseCode: warehouse,
          onHand: 0,
          reserved: 0,
        })
        .orIgnore()          // INSERT ... ON CONFLICT DO NOTHING
        .execute();

      // 3. ATOMIC STOCK UPDATE (conditional where needed)
      if (INBOUND_KINDS.has(input.kind)) {
        // Inbound: always succeeds (stock goes up)
        await manager
          .createQueryBuilder()
          .update(StockLevel)
          .set({
            onHand: () => `"onHand" + :qty`,
            lastMovementAt: new Date(),
          })
          .where('"variantId" = :variantId AND "warehouseCode" = :wh', {
            variantId: input.variantId,
            wh: warehouse,
            qty: input.quantity,
          })
          .execute();
      } else if (OUTBOUND_KINDS.has(input.kind)) {
        // Outbound: conditional — only if sufficient stock
        const result = await manager
          .createQueryBuilder()
          .update(StockLevel)
          .set({
            onHand: () => `"onHand" - :qty`,
            lastMovementAt: new Date(),
          })
          .where(
            '"variantId" = :variantId AND "warehouseCode" = :wh AND "onHand" >= :qty',
            {
              variantId: input.variantId,
              wh: warehouse,
              qty: input.quantity,
            },
          )
          .execute();

        if (result.affected === 0) {
          const level = await manager.findOne(StockLevel, {
            where: { variantId: input.variantId, warehouseCode: warehouse },
          });
          throw new ConflictException(
            `Insufficient stock for variant ${input.variantId}: have ${level?.onHand ?? 0}, need ${input.quantity}`,
          );
        }
      } else if (input.kind === MovementKind.RESERVATION) {
        // Reserve: conditional — only if enough available (onHand - reserved)
        const result = await manager
          .createQueryBuilder()
          .update(StockLevel)
          .set({
            reserved: () => `"reserved" + :qty`,
            lastMovementAt: new Date(),
          })
          .where(
            '"variantId" = :variantId AND "warehouseCode" = :wh AND ("onHand" - "reserved") >= :qty',
            {
              variantId: input.variantId,
              wh: warehouse,
              qty: input.quantity,
            },
          )
          .execute();

        if (result.affected === 0) {
          const level = await manager.findOne(StockLevel, {
            where: { variantId: input.variantId, warehouseCode: warehouse },
          });
          const available = level ? level.onHand - level.reserved : 0;
          throw new ConflictException(
            `Insufficient available stock for variant ${input.variantId}: available ${available}, need ${input.quantity}`,
          );
        }
      } else if (input.kind === MovementKind.RELEASE) {
        // Release: always succeeds, clamp to zero
        await manager
          .createQueryBuilder()
          .update(StockLevel)
          .set({
            reserved: () => `GREATEST(0, "reserved" - :qty)`,
            lastMovementAt: new Date(),
          })
          .where('"variantId" = :variantId AND "warehouseCode" = :wh', {
            variantId: input.variantId,
            wh: warehouse,
            qty: input.quantity,
          })
          .execute();
      }

      // 4. APPEND IMMUTABLE MOVEMENT
      const mvt = manager.create(StockMovement, {
        variantId: input.variantId,
        kind: input.kind,
        quantity: input.quantity,
        warehouseCode: warehouse,
        referenceId: input.referenceId,
        referenceType: input.referenceType,
        reason: input.reason,
        createdBy: input.createdBy,
      });
      return manager.save(StockMovement, mvt);
    });

    // ── 5. INVALIDATE CACHE (outside transaction — non-critical) ──
    if (this.cacheService) {
      await this.cacheService.invalidateStock(input.variantId);
    }

    return movement;
  }

  /**
   * Get current stock level for a variant at a warehouse.
   */
  async getStockLevel(
    variantId: string,
    warehouseCode = 'DEFAULT',
  ): Promise<StockLevel | null> {
    // Check cache first
    if (this.cacheService) {
      const cacheKey = CacheService.stockLevelKey(variantId, warehouseCode);
      const cached = await this.cacheService.get<StockLevel>(cacheKey);
      if (cached) return cached;
    }

    const level = await this.levelRepo.findOne({
      where: { variantId, warehouseCode },
    });

    // Populate cache
    if (level && this.cacheService) {
      await this.cacheService.set(
        CacheService.stockLevelKey(variantId, warehouseCode),
        level,
        CacheService.TTL.STOCK_LEVEL,
      );
    }

    return level;
  }

  /**
   * Get stock levels across all warehouses for a variant.
   */
  async getStockLevels(variantId: string): Promise<StockLevel[]> {
    return this.levelRepo.find({ where: { variantId } });
  }

  /**
   * Get all stock levels, optionally filtered — used by admin and POS.
   */
  async getAllStockLevels(query?: {
    page?: number;
    limit?: number;
    warehouseCode?: string;
    lowStockOnly?: boolean;
    lowStockThreshold?: number;
  }): Promise<{ items: StockLevel[]; total: number; page: number; limit: number }> {
    const page = query?.page ?? 1;
    const limit = Math.min(query?.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const qb = this.levelRepo.createQueryBuilder('sl');

    if (query?.warehouseCode) {
      qb.andWhere('sl."warehouseCode" = :wh', { wh: query.warehouseCode });
    }

    if (query?.lowStockOnly) {
      const threshold = query.lowStockThreshold ?? 5;
      qb.andWhere('(sl."onHand" - sl."reserved") <= :threshold AND sl."onHand" > 0', {
        threshold,
      });
    }

    qb.orderBy('sl."lastMovementAt"', 'DESC');
    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  /**
   * Get movement history for a variant (most recent first).
   */
  async getMovementHistory(
    variantId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ items: StockMovement[]; total: number }> {
    const [items, total] = await this.movementRepo.findAndCount({
      where: { variantId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total };
  }

  /**
   * Bulk check availability for multiple variants (used by checkout).
   */
  async checkAvailability(
    items: { variantId: string; quantity: number }[],
  ): Promise<{ variantId: string; available: number; sufficient: boolean }[]> {
    const results = [];
    for (const item of items) {
      const level = await this.getStockLevel(item.variantId);
      const available = level ? level.onHand - level.reserved : 0;
      results.push({
        variantId: item.variantId,
        available,
        sufficient: available >= item.quantity,
      });
    }
    return results;
  }
}
