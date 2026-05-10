import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds shipment / delivery tracking columns to `orders` per
 * SCANNER_APP_PLAN.md §4.7 (PR #6).
 *
 *   trackingNumber  varchar(100) NULL  — courier-provided shipment ID
 *   carrier         varchar(100) NULL  — courier name (DHL, GIG Logistics, ...)
 *   shippedAt       timestamptz  NULL  — when the SHIPPED transition fired
 *   deliveredAt     timestamptz  NULL  — when the DELIVERED transition fired
 *
 * All four columns are NULLABLE. Existing orders get NULL on backfill;
 * no row migration needed. New orders default to NULL until the dispatch
 * flow fills them.
 *
 * Idempotent: re-runs are no-ops (`IF NOT EXISTS`).
 *
 * Note on naming: quoted camelCase to stay consistent with the rest of
 * the `orders` table (paidAt, grandTotal, etc).
 */
export class AddOrderShipmentColumns1713500090000
  implements MigrationInterface
{
  name = 'AddOrderShipmentColumns1713500090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "trackingNumber" varchar(100),
        ADD COLUMN IF NOT EXISTS "carrier"        varchar(100),
        ADD COLUMN IF NOT EXISTS "shippedAt"      timestamptz,
        ADD COLUMN IF NOT EXISTS "deliveredAt"    timestamptz
    `);

    // Index for "shipped but not delivered" courier queries — small,
    // filtered by status separately. Cheap to maintain at our scale.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_trackingNumber"
        ON "orders" ("trackingNumber")
        WHERE "trackingNumber" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_trackingNumber"`);
    await queryRunner.query(`
      ALTER TABLE "orders"
        DROP COLUMN IF EXISTS "trackingNumber",
        DROP COLUMN IF EXISTS "carrier",
        DROP COLUMN IF EXISTS "shippedAt",
        DROP COLUMN IF EXISTS "deliveredAt"
    `);
  }
}
