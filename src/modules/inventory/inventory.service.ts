import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
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
  /**
   * Optional client-side idempotency key (UUID) for the batch endpoint.
   * If supplied and a movement with this key already exists, the existing
   * row is returned and no stock change occurs.
   */
  clientLineId?: string;
}

/** One line in a batch movements request. Same fields as a single. */
export interface RecordMovementBatchLine {
  clientLineId: string;
  variantId: string;
  kind: MovementKind;
  quantity: number;
  warehouseCode?: string;
  referenceId?: string;
  referenceType?: string;
  reason?: string;
}

/** Outcome of one line in a batch. */
export interface RecordMovementBatchLineResult {
  clientLineId: string;
  status: 'ACCEPTED' | 'DEDUPLICATED';
  movementId: string;
}

/** Aggregate result of a batch call. */
export interface RecordMovementBatchResult {
  accepted: number;
  deduplicated: number;
  lines: RecordMovementBatchLineResult[];
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
    const movement = await this.dataSource.transaction(async (manager) => {
      const result = await this.recordMovementOnManager(manager, input);
      return result.movement;
    });

    // Cache invalidation outside the transaction — non-critical, eventual.
    if (this.cacheService) {
      await this.cacheService.invalidateStock(input.variantId);
    }

    return movement;
  }

  /**
   * Same logical work as `recordMovement` but operates inside a caller-
   * supplied EntityManager. The batch endpoint uses this so all lines in
   * a request share one transaction (all-or-nothing semantics).
   *
   * Returns both the persisted movement AND a `deduplicated` flag so the
   * caller can report per-line outcomes.
   */
  async recordMovementOnManager(
    manager: EntityManager,
    input: RecordMovementInput,
  ): Promise<{ movement: StockMovement; deduplicated: boolean }> {
    if (input.quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }

    const warehouse = input.warehouseCode ?? 'DEFAULT';

    // ── 1a. IDEMPOTENCY: clientLineId-based (batch endpoint) ──
    if (input.clientLineId) {
      const existing = await manager.findOne(StockMovement, {
        where: { clientLineId: input.clientLineId },
      });
      if (existing) {
        this.logger.debug(
          `Idempotent skip (clientLineId): variant=${input.variantId} clientLineId=${input.clientLineId}`,
        );
        return { movement: existing, deduplicated: true };
      }
    }

    // ── 1b. IDEMPOTENCY: reference-tuple-based (legacy path) ──
    if (input.referenceId && input.referenceType) {
      const existing = await manager.findOne(StockMovement, {
        where: {
          referenceId: input.referenceId,
          referenceType: input.referenceType,
          variantId: input.variantId,
          kind: input.kind,
        },
      });
      if (existing) {
        this.logger.debug(
          `Idempotent skip (reference): ${input.kind} for variant=${input.variantId} ref=${input.referenceId}`,
        );
        return { movement: existing, deduplicated: true };
      }
    }

    // ── 2. ENSURE StockLevel ROW EXISTS (upsert) ──
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
      .orIgnore() // INSERT ... ON CONFLICT DO NOTHING
      .execute();

    // ── 3. ATOMIC STOCK UPDATE (conditional where needed) ──
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

    // ── 4. APPEND IMMUTABLE MOVEMENT ──
    const mvt = manager.create(StockMovement, {
      variantId: input.variantId,
      kind: input.kind,
      quantity: input.quantity,
      warehouseCode: warehouse,
      referenceId: input.referenceId,
      referenceType: input.referenceType,
      reason: input.reason,
      createdBy: input.createdBy,
      clientLineId: input.clientLineId,
    });
    const saved = await manager.save(StockMovement, mvt);

    return { movement: saved, deduplicated: false };
  }

  /**
   * Batch movements: process N lines in ONE transaction. All-or-nothing —
   * if any line fails (insufficient stock, validation error), the entire
   * batch rolls back. Per-line idempotency via `clientLineId`.
   *
   * Used by the scanner mobile app's restock and returns flows where a
   * single supplier delivery / return run produces dozens of lines.
   *
   * Cache invalidation runs once after commit, deduped by variantId.
   */
  async recordMovementsBatch(
    lines: RecordMovementBatchLine[],
    createdBy: string | undefined,
  ): Promise<RecordMovementBatchResult> {
    if (!lines || lines.length === 0) {
      throw new BadRequestException('At least one line is required');
    }
    if (lines.length > 500) {
      // Defensive cap — a typical scanner batch is 1–50. Rejecting >500
      // protects against runaway clients without changing realistic flows.
      throw new BadRequestException('Batch size exceeds maximum (500 lines)');
    }

    // Defensive: reject duplicate clientLineIds within the same request.
    // The DB unique index would catch it, but a clearer error here helps
    // the client report which line is the offender before any work runs.
    const seen = new Set<string>();
    for (const line of lines) {
      if (!line.clientLineId) {
        throw new BadRequestException('Every batch line requires a clientLineId');
      }
      if (seen.has(line.clientLineId)) {
        throw new BadRequestException(
          `Duplicate clientLineId in request: ${line.clientLineId}`,
        );
      }
      seen.add(line.clientLineId);
    }

    const results: RecordMovementBatchLineResult[] = [];
    let acceptedCount = 0;
    let deduplicatedCount = 0;

    await this.dataSource.transaction(async (manager) => {
      for (const line of lines) {
        const { movement, deduplicated } = await this.recordMovementOnManager(
          manager,
          {
            variantId: line.variantId,
            kind: line.kind,
            quantity: line.quantity,
            warehouseCode: line.warehouseCode,
            referenceId: line.referenceId,
            referenceType: line.referenceType,
            reason: line.reason,
            createdBy,
            clientLineId: line.clientLineId,
          },
        );

        results.push({
          clientLineId: line.clientLineId,
          status: deduplicated ? 'DEDUPLICATED' : 'ACCEPTED',
          movementId: movement.id,
        });

        if (deduplicated) deduplicatedCount++;
        else acceptedCount++;
      }
    });

    // Invalidate cache once per unique variant (post-commit).
    if (this.cacheService) {
      const uniqueVariantIds = new Set(lines.map((l) => l.variantId));
      await Promise.all(
        Array.from(uniqueVariantIds).map((vid) =>
          this.cacheService!.invalidateStock(vid),
        ),
      );
    }

    return {
      accepted: acceptedCount,
      deduplicated: deduplicatedCount,
      lines: results,
    };
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
