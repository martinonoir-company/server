"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddAajShippingToOrders1713500210000 = void 0;
class AddAajShippingToOrders1713500210000 {
    constructor() {
        this.name = 'AddAajShippingToOrders1713500210000';
    }
    async up(queryRunner) {
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
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_shippingBookingId_pending"
        ON "orders" ("shippingBookingId")
        WHERE "shippingBookingId" IS NOT NULL AND "shippingTrackingId" IS NULL;
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_shippingTrackingId"
        ON "orders" ("shippingTrackingId");
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_shippingTrackingId";`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_shippingBookingId_pending";`);
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
exports.AddAajShippingToOrders1713500210000 = AddAajShippingToOrders1713500210000;
//# sourceMappingURL=1713500210000-AddAajShippingToOrders.js.map