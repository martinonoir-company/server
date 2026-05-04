import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockMovement, StockLevel, MovementKind } from './entities/inventory.entity';
import { ProductVariant } from '../products/entities/product.entity';
import { InventoryService } from './inventory.service';
import { EmailService } from '../notifications/email.service';

/**
 * Scheduled inventory tasks.
 * - Reservation expiry: auto-releases reservations older than 15 minutes
 * - Low stock alerts: checks for variants below threshold and emails admin
 */
@Injectable()
export class InventoryCronService {
  private readonly logger = new Logger(InventoryCronService.name);
  private readonly RESERVATION_TTL_MINUTES = 15;
  private readonly LOW_STOCK_THRESHOLD = 5;
  private readonly ADMIN_ALERT_EMAIL = process.env['ADMIN_ALERT_EMAIL'] ?? 'martinonoirbag@gmail.com';

  /** Track last alert time per variant to avoid spamming (24h cooldown) */
  private readonly lastAlerted = new Map<string, number>();
  private readonly ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    @InjectRepository(StockMovement) private readonly movementRepo: Repository<StockMovement>,
    @InjectRepository(StockLevel) private readonly levelRepo: Repository<StockLevel>,
    @InjectRepository(ProductVariant) private readonly variantRepo: Repository<ProductVariant>,
    private readonly inventoryService: InventoryService,
    private readonly emailService: EmailService,
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
   * Every 5 minutes: check for low stock and send email alerts.
   * Each variant is only alerted once per 24 hours to prevent spam.
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

      // Check cooldown — skip if alerted recently
      const lastTime = this.lastAlerted.get(level.variantId) ?? 0;
      if (Date.now() - lastTime < this.ALERT_COOLDOWN_MS) continue;

      // Look up variant name and SKU
      try {
        const variant = await this.variantRepo.findOne({ where: { id: level.variantId } });
        if (!variant) continue;

        await this.emailService.sendLowStockAlert(
          this.ADMIN_ALERT_EMAIL,
          variant.sku,
          variant.name ?? variant.sku,
          available,
        );

        this.lastAlerted.set(level.variantId, Date.now());
        this.logger.log(`Low stock alert sent for ${variant.sku} (${variant.name})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`Failed to send low stock alert for ${level.variantId}: ${msg}`);
      }
    }
  }
}
