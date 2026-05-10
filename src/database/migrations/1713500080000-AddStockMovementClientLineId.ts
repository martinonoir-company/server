import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `client_line_id` to `stock_movements` for the batch movements
 * endpoint introduced in SCANNER_APP_PLAN.md §4.2 (PR #5).
 *
 * Why a dedicated idempotency column instead of reusing the existing
 * (referenceId, referenceType, variantId, kind) unique index:
 *  - The scanner mobile app generates a UUID per scanned line at scan time.
 *    That ID survives client-side retries / offline queue replay.
 *  - The existing reference-based index is keyed on a TUPLE that requires
 *    referenceId + referenceType to be set; many ad-hoc adjustments and
 *    receipts have neither (NULL referenceId), so they sit outside that
 *    index. The mobile flow needs idempotency for ALL lines, including
 *    those without a reference.
 *  - A single nullable UUID column with a partial unique index gives us
 *    perfect retry safety with zero coupling to existing semantics.
 *
 * The column is NULLABLE — every existing row gets NULL on backfill, no
 * data conversion required. New rows from the single-line endpoint also
 * remain NULL (no idempotency key supplied), keeping their behavior
 * unchanged. Only the batch endpoint sets this column.
 *
 * Idempotent: re-runs are no-ops (`IF NOT EXISTS`).
 */
export class AddStockMovementClientLineId1713500080000
  implements MigrationInterface
{
  name = 'AddStockMovementClientLineId1713500080000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add the column. Quoted identifier preserves camelCase for TypeORM
    // entity mapping consistency with the rest of stock_movements.
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
        ADD COLUMN IF NOT EXISTS "clientLineId" varchar(36)
    `);

    // Partial unique index — allows multiple NULLs (for non-batch
    // movements), enforces uniqueness when a clientLineId is supplied.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_stock_movements_clientLineId"
        ON "stock_movements" ("clientLineId")
        WHERE "clientLineId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_stock_movements_clientLineId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "clientLineId"`,
    );
  }
}
