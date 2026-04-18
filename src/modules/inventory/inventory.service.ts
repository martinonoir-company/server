import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { StockMovement, StockLevel, MovementKind } from './entities/inventory.entity';

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
  constructor(
    @InjectRepository(StockMovement)
    private readonly movementRepo: Repository<StockMovement>,
    @InjectRepository(StockLevel)
    private readonly levelRepo: Repository<StockLevel>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Record a stock movement and update the materialised level — all in one transaction.
   * Uses SELECT ... FOR UPDATE to prevent concurrent level corruption.
   */
  async recordMovement(input: RecordMovementInput): Promise<StockMovement> {
    if (input.quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }

    const warehouse = input.warehouseCode ?? 'DEFAULT';

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      // 1. Insert the immutable movement
      const movement = manager.create(StockMovement, {
        variantId: input.variantId,
        kind: input.kind,
        quantity: input.quantity,
        warehouseCode: warehouse,
        referenceId: input.referenceId,
        referenceType: input.referenceType,
        reason: input.reason,
        createdBy: input.createdBy,
      });
      await manager.save(movement);

      // 2. Upsert the stock level with lock
      let level = await manager
        .createQueryBuilder(StockLevel, 'sl')
        .setLock('pessimistic_write')
        .where('sl.variantId = :variantId AND sl.warehouseCode = :warehouse', {
          variantId: input.variantId,
          warehouse,
        })
        .getOne();

      if (!level) {
        level = manager.create(StockLevel, {
          variantId: input.variantId,
          warehouseCode: warehouse,
          onHand: 0,
          reserved: 0,
        });
      }

      // 3. Apply the movement effect
      if (INBOUND_KINDS.has(input.kind)) {
        level.onHand += input.quantity;
      } else if (OUTBOUND_KINDS.has(input.kind)) {
        if (level.onHand < input.quantity) {
          throw new ConflictException(
            `Insufficient stock for variant ${input.variantId}: have ${level.onHand}, need ${input.quantity}`,
          );
        }
        level.onHand -= input.quantity;
      } else if (input.kind === MovementKind.RESERVATION) {
        const available = level.onHand - level.reserved;
        if (available < input.quantity) {
          throw new ConflictException(
            `Insufficient available stock for variant ${input.variantId}: available ${available}, need ${input.quantity}`,
          );
        }
        level.reserved += input.quantity;
      } else if (input.kind === MovementKind.RELEASE) {
        level.reserved = Math.max(0, level.reserved - input.quantity);
      }

      level.lastMovementAt = new Date();
      await manager.save(StockLevel, level);

      return movement;
    });
  }

  /**
   * Get current stock level for a variant at a warehouse.
   */
  async getStockLevel(
    variantId: string,
    warehouseCode = 'DEFAULT',
  ): Promise<StockLevel | null> {
    return this.levelRepo.findOne({
      where: { variantId, warehouseCode },
    });
  }

  /**
   * Get stock levels across all warehouses for a variant.
   */
  async getStockLevels(variantId: string): Promise<StockLevel[]> {
    return this.levelRepo.find({ where: { variantId } });
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
