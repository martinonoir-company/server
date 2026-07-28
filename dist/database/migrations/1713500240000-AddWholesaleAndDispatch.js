"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddWholesaleAndDispatch1713500240000 = void 0;
class AddWholesaleAndDispatch1713500240000 {
    constructor() {
        this.name = 'AddWholesaleAndDispatch1713500240000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "order_items"
        ADD COLUMN IF NOT EXISTS "isWholesale" boolean NOT NULL DEFAULT false;
    `);
        await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "isWholesale" boolean NOT NULL DEFAULT false;
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_isWholesale"
        ON "orders" ("isWholesale");
    `);
        await queryRunner.query(`
      ALTER TABLE "cart_items"
        ADD COLUMN IF NOT EXISTS "isWholesale" boolean NOT NULL DEFAULT false;
    `);
        await queryRunner.query(`
      ALTER TABLE "cart_items"
        DROP CONSTRAINT IF EXISTS "UQ_cart_user_variant";
    `);
        await queryRunner.query(`
      ALTER TABLE "cart_items"
        ADD CONSTRAINT "UQ_cart_user_variant"
        UNIQUE ("userId", "variantId", "isWholesale");
    `);
        await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "dispatchStatus" varchar(20);
    `);
        await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "dispatchedAt" timestamptz;
    `);
        await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "dispatchedBy" varchar(26);
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_dispatchStatus"
        ON "orders" ("dispatchStatus");
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_dispatchStatus";`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "dispatchedBy";`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "dispatchedAt";`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "dispatchStatus";`);
        await queryRunner.query(`
      ALTER TABLE "cart_items"
        DROP CONSTRAINT IF EXISTS "UQ_cart_user_variant";
    `);
        await queryRunner.query(`
      ALTER TABLE "cart_items"
        ADD CONSTRAINT "UQ_cart_user_variant"
        UNIQUE ("userId", "variantId");
    `);
        await queryRunner.query(`ALTER TABLE "cart_items" DROP COLUMN IF EXISTS "isWholesale";`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_isWholesale";`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "isWholesale";`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "isWholesale";`);
    }
}
exports.AddWholesaleAndDispatch1713500240000 = AddWholesaleAndDispatch1713500240000;
//# sourceMappingURL=1713500240000-AddWholesaleAndDispatch.js.map