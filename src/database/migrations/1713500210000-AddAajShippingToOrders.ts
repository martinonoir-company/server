import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds AAJ Express shipping-integration columns to `orders`.
 *
 * The order already has `trackingNumber` + `carrier` + `shippedAt`
 * (originally used by the manual scanner dispatch flow). Those stay.
 * What's new here is the AAJ-specific machinery:
 *
 *   - shippingOptOut         — customer ticked "I don't need shipping"
 *   - shippingQuoteId        — AAJ draft booking id from the quote
 *   - shippingQuoteExpiresAt — when we have to re-quote
 *   - shippingBookingId      — AAJ booking _id (input to processBooking)
 *   - shippingTrackingId     — AAJ tracking id (customer-facing)
 *   - shippingLabelUrl       — PDF label URL from processBooking
 *   - shippingStatus         — enum 0..4 (LABEL_CREATED..DELIVERED)
 *   - shippingEvents         — cached event timeline
 *   - shippingLastTrackedAt  — TTL marker for the 60-second cache
 *   - shippingRetryCount     — back-off + admin alert input
 *   - shippingLastError      — surfaced to admin alert when retries fail
 *
 * All defaults are inert so the rollout is backwards-compatible: every
 * existing order is treated as "shipping not opted out, no AAJ data".
 */
export class AddAajShippingToOrders1713500210000
  implements MigrationInterface
{
  name = 'AddAajShippingToOrders1713500210000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "shippingOptOut" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "shippingQuoteId" varchar(64),
        ADD COLUMN IF NOT EXISTS "shippingQuoteExpiresAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "shippingBookingId" varchar(64),
        ADD COLUMN IF NOT EXISTS "shippingTrackingId" varchar(100),
        ADD COLUMN IF NOT EXISTS "shippingLabelUrl" varchar(1024),
        ADD COLUMN IF NOT EXISTS "shippingStatus" integer,
        ADD COLUMN IF NOT EXISTS "shippingEvents" jsonb,
        ADD COLUMN IF NOT EXISTS "shippingLastTrackedAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "shippingRetryCount" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "shippingLastError" text;
    `);
    // The retry worker scans for orders with a shippingBookingId but
    // no shippingTrackingId — index lets it run cheap.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_shippingBookingId_pending"
        ON "orders" ("shippingBookingId")
        WHERE "shippingBookingId" IS NOT NULL AND "shippingTrackingId" IS NULL;
    `);
    // Tracking lookups by AAJ tracking id (admin search, deep links).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_shippingTrackingId"
        ON "orders" ("shippingTrackingId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_orders_shippingTrackingId";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_orders_shippingBookingId_pending";`,
    );
    await queryRunner.query(`
      ALTER TABLE "orders"
        DROP COLUMN IF EXISTS "shippingLastError",
        DROP COLUMN IF EXISTS "shippingRetryCount",
        DROP COLUMN IF EXISTS "shippingLastTrackedAt",
        DROP COLUMN IF EXISTS "shippingEvents",
        DROP COLUMN IF EXISTS "shippingStatus",
        DROP COLUMN IF EXISTS "shippingLabelUrl",
        DROP COLUMN IF EXISTS "shippingTrackingId",
        DROP COLUMN IF EXISTS "shippingBookingId",
        DROP COLUMN IF EXISTS "shippingQuoteExpiresAt",
        DROP COLUMN IF EXISTS "shippingQuoteId",
        DROP COLUMN IF EXISTS "shippingOptOut";
    `);
  }
}
