import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a PARTIAL UNIQUE INDEX on `product_variants.barcode` so two active
 * variants cannot share a barcode. Nullable barcodes remain allowed
 * (`WHERE barcode IS NOT NULL`).
 *
 * Pre-flight: detect any pre-existing duplicate non-null barcodes and
 * fail the migration with a clear listing instead of letting the index
 * creation throw a generic constraint-violation error. This protects
 * production deploys where ambiguous data must be resolved by a human
 * before the constraint can be enforced.
 *
 * Idempotent: re-runs are no-ops (`IF NOT EXISTS`).
 */
export class AddVariantBarcodeUniqueIndex1713500060000 implements MigrationInterface {
  name = 'AddVariantBarcodeUniqueIndex1713500060000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Pre-flight: list duplicate barcodes among active (non-deleted) variants.
    // Soft-deleted rows are excluded from the constraint via the partial
    // index predicate, so we only flag duplicates among active rows.
    const duplicates = (await queryRunner.query(`
      SELECT "barcode",
             ARRAY_AGG("id") AS "ids",
             COUNT(*)::text AS "count"
        FROM "product_variants"
       WHERE "barcode" IS NOT NULL
         AND "deletedAt" IS NULL
       GROUP BY "barcode"
      HAVING COUNT(*) > 1
       ORDER BY "barcode"
    `)) as Array<{ barcode: string; ids: string[]; count: string }>;

    if (duplicates.length > 0) {
      const summary = duplicates
        .map(
          (d) =>
            `  • barcode "${d.barcode}" used by ${d.count} variants: ${d.ids.join(', ')}`,
        )
        .join('\n');
      throw new Error(
        `Cannot create unique index on product_variants.barcode — duplicates exist:\n${summary}\n` +
          `Resolve these via the admin UI (clear the barcode on duplicates) and re-run the migration.`,
      );
    }

    // Partial unique index — allows multiple NULLs, enforces uniqueness
    // among active rows that have a barcode.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_product_variants_barcode_active"
        ON "product_variants" ("barcode")
        WHERE "barcode" IS NOT NULL AND "deletedAt" IS NULL
    `);

    // Convenience non-unique index for fast lookup whether the row is
    // soft-deleted or not (history queries by barcode).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_variants_barcode"
        ON "product_variants" ("barcode")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_product_variants_barcode_active"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_variants_barcode"`,
    );
  }
}
