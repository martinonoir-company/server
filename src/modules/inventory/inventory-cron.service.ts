import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { StockMovement, StockLevel, MovementKind } from './entities/inventory.entity';
import { InventoryService } from './inventory.service';

/**
 * Scheduled inventory tasks.
 * - Reservation expiry: auto-releases reservations older than 15 minutes
 * - Low stock alerts: checks for variants below threshold
 */
@Injectable()
export class InventoryCronService {
  private readonly logger = new Logger(InventoryCronService.name);
  private readonly RESERVATION_TTL_MINUTES = 15;
  private readonly LOW_STOCK_THRESHOLD = 5;

  constructor(
    @InjectRepository(StockMovement) private readonly movementRepo: Repository<StockMovement>,
    @InjectRepository(StockLevel) private readonly levelRepo: Repository<StockLevel>,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * Every 60 seconds: find and release expired reservations.
   * A reservation is expired if:
   * - It's a RESERVATION movement
   * - It was created > 15 minutes ago
   * - No corresponding RELEASE or SALE movement exists with the same referenceId
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireReservations(): Promise<void> {
    const cutoff = new Date(Date.now() - this.RESERVATION_TTL_MINUTES * 60 * 1000);

    // Find unreleased reservations older than TTL
    const expiredReservations = await this.movementRepo
      .createQueryBuilder('m')
      .where('m.kind = :kind', { kind: MovementKind.RESERVATION })
      .andWhere('m.createdAt < :cutoff', { cutoff })
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM stock_movements rel
          WHERE rel.kind IN (:...releaseKinds)
          AND rel."referenceId" = m."referenceId"
          AND rel."referenceType" = m."referenceType"
          AND rel."variantId" = m."variantId"
        )`,
        { releaseKinds: [MovementKind.RELEASE, MovementKind.SALE] },
      )
      .getMany();

    if (expiredReservations.length === 0) return;

    this.logger.warn(
      `Found ${expiredReservations.length} expired reservation(s). Releasing...`,
    );

    for (const reservation of expiredReservations) {
      try {
        await this.inventoryService.recordMovement({
          variantId: reservation.variantId,
          kind: MovementKind.RELEASE,
          quantity: reservation.quantity,
          referenceId: reservation.referenceId,
          referenceType: reservation.referenceType,
          reason: `Auto-released: reservation expired after ${this.RESERVATION_TTL_MINUTES} minutes`,
        });

        this.logger.log(
          `Released expired reservation: variant=${reservation.variantId}, qty=${reservation.quantity}`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to release reservation ${reservation.id}: ${msg}`,
        );
      }
    }
  }

  /**
   * Every 5 minutes: check for low stock and log warnings.
   * TODO: Wire to EmailService.sendLowStockAlert() when notifications are configured.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkLowStock(): Promise<void> {
    const lowStockLevels = await this.levelRepo
      .createQueryBuilder('sl')
      .where('(sl.onHand - sl.reserved) <= :threshold', {
        threshold: this.LOW_STOCK_THRESHOLD,
      })
      .andWhere('sl.onHand > 0') // Ignore already-depleted
      .getMany();

    for (const level of lowStockLevels) {
      const available = level.onHand - level.reserved;
      this.logger.warn(
        `LOW STOCK: variant=${level.variantId}, warehouse=${level.warehouseCode}, available=${available}`,
      );
    }
  }
}
