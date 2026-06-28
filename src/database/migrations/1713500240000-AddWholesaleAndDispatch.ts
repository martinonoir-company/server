import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Wholesale orders + dispatch sorting.
 *
 * Wholesale:
 *  - order_items.isWholesale  — line was bought at the variant's wholesale
 *                               price (qty ≥ MIN_WHOLESALE_QTY).
 *  - orders.isWholesale       — denormalised: any line wholesale → true.
 *                               Indexed for the admin "wholesale orders"
 *                               list + accounting aggregation.
 *  - cart_items.isWholesale   — a wholesale line in the persisted cart. The
 *                               (userId, variantId) unique key is widened to
 *                               include it so retail + wholesale of the same
 *                               variant can coexist in one cart.
 *
 * Dispatch:
 *  - orders.dispatchStatus    — PENDING | DISPATCHED, NULL when the order
 *                               needs no dispatch (no shipping / opted out).
 *  - orders.dispatchedAt      — when staff scanned it to the courier.
 *  - orders.dispatchedBy      — staff user id who scanned it.
 *
 * All columns are additive with inert defaults, so existing rows and the
 * existing checkout / cart paths are unaffected until the new code writes
 * the flags.
 */
export class AddWholesaleAndDispatch1713500240000
  implements MigrationInterface
{
  name = 'AddWholesaleAndDispatch1713500240000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Wholesale flags ──
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
    // Widen the cart uniqueness to (userId, variantId, isWholesale).
    await queryRunner.query(`
      ALTER TABLE "cart_items"
        DROP CONSTRAINT IF EXISTS "UQ_cart_user_variant";
    `);
    await queryRunner.query(`
      ALTER TABLE "cart_items"
        ADD CONSTRAINT "UQ_cart_user_variant"
        UNIQUE ("userId", "variantId", "isWholesale");
    `);

    // ── Dispatch ──
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_orders_dispatchStatus";`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "dispatchedBy";`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "dispatchedAt";`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "dispatchStatus";`,
    );

    await queryRunner.query(`
      ALTER TABLE "cart_items"
        DROP CONSTRAINT IF EXISTS "UQ_cart_user_variant";
    `);
    await queryRunner.query(`
      ALTER TABLE "cart_items"
        ADD CONSTRAINT "UQ_cart_user_variant"
        UNIQUE ("userId", "variantId");
    `);
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP COLUMN IF EXISTS "isWholesale";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_orders_isWholesale";`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "isWholesale";`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP COLUMN IF EXISTS "isWholesale";`,
    );
  }
}
