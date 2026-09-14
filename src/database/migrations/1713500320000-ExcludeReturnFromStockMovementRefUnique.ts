import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allow multiple partial RETURN movements for the same variant on one order.
 *
 * stock_movements had a partial UNIQUE index on
 *   (referenceId, referenceType, variantId, kind) WHERE referenceId IS NOT NULL
 * which prevented a second refund of the same item on the same order from
 * recording its RETURN movement — so partial refunds after the first restored
 * no stock (and later ones hit a duplicate-key error).
 *
 * RETURN movements already carry a unique clientLineId (enforced by
 * UQ_stock_movements_clientLineId), so they don't need this coarse dedupe.
 * Recreate the index excluding RETURN; sales/order postings keep the guard.
 *
 * Two historical copies of this index exist (an explicitly-named one and a
 * TypeORM auto-named one) — drop both, recreate a single explicit one.
 */
export class ExcludeReturnFromStockMovementRefUnique1713500320000
  implements MigrationInterface
{
  name = 'ExcludeReturnFromStockMovementRefUnique1713500320000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stock_movements_ref_unique";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_e572a492b1723d71b00ec47e91";`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_stock_movements_ref_unique"
        ON "stock_movements" ("referenceId", "referenceType", "variantId", "kind")
        WHERE "referenceId" IS NOT NULL AND "kind" <> 'RETURN';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stock_movements_ref_unique";`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_stock_movements_ref_unique"
        ON "stock_movements" ("referenceId", "referenceType", "variantId", "kind")
        WHERE "referenceId" IS NOT NULL;
    `);
  }
}
