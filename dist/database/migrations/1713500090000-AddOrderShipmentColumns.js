"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddOrderShipmentColumns1713500090000 = void 0;
class AddOrderShipmentColumns1713500090000 {
    constructor() {
        this.name = 'AddOrderShipmentColumns1713500090000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "trackingNumber" varchar(100),
        ADD COLUMN IF NOT EXISTS "carrier"        varchar(100),
        ADD COLUMN IF NOT EXISTS "shippedAt"      timestamptz,
        ADD COLUMN IF NOT EXISTS "deliveredAt"    timestamptz
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_trackingNumber"
        ON "orders" ("trackingNumber")
        WHERE "trackingNumber" IS NOT NULL
    `);
    }
    async down(queryRunner) {
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
exports.AddOrderShipmentColumns1713500090000 = AddOrderShipmentColumns1713500090000;
//# sourceMappingURL=1713500090000-AddOrderShipmentColumns.js.map