import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames the single `priceNgn` / `priceUsd` columns on `product_variants`
 * into the retail/wholesale split the ProductVariant entity now expects.
 *
 * Forward:
 *   priceNgn  -> retailPriceNgn
 *   priceUsd  -> retailPriceUsd
 *   + add    wholesalePriceNgn / wholesalePriceUsd (backfilled from retail)
 *
 * Safe to run against a DB that was previously managed by `synchronize: true`.
 */
export class RenameVariantPriceColumns1713500000000 implements MigrationInterface {
  name = 'RenameVariantPriceColumns1713500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Rename existing columns only if the old names are still present
    //    (idempotent — lets this migration survive partial hand-applied state).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
           WHERE table_name = 'product_variants' AND column_name = 'priceNgn'
        ) THEN
          ALTER TABLE "product_variants" RENAME COLUMN "priceNgn" TO "retailPriceNgn";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
           WHERE table_name = 'product_variants' AND column_name = 'priceUsd'
        ) THEN
          ALTER TABLE "product_variants" RENAME COLUMN "priceUsd" TO "retailPriceUsd";
        END IF;
      END $$;
    `);

    // 2. Add the wholesale columns as nullable first so we can backfill.
    await queryRunner.query(`
      ALTER TABLE "product_variants"
        ADD COLUMN IF NOT EXISTS "wholesalePriceNgn" bigint,
        ADD COLUMN IF NOT EXISTS "wholesalePriceUsd" bigint
    `);

    // 3. Backfill: default wholesale = retail for any existing rows where it's null.
    await queryRunner.query(`
      UPDATE "product_variants"
         SET "wholesalePriceNgn" = COALESCE("wholesalePriceNgn", "retailPriceNgn"),
             "wholesalePriceUsd" = COALESCE("wholesalePriceUsd", "retailPriceUsd")
    `);

    // 4. Tighten: wholesale columns must be NOT NULL to match the entity.
    await queryRunner.query(`
      ALTER TABLE "product_variants"
        ALTER COLUMN "wholesalePriceNgn" SET NOT NULL,
        ALTER COLUMN "wholesalePriceUsd" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse: drop wholesale, rename retail back to plain price columns.
    await queryRunner.query(`
      ALTER TABLE "product_variants"
        DROP COLUMN IF EXISTS "wholesalePriceNgn",
        DROP COLUMN IF EXISTS "wholesalePriceUsd"
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
           WHERE table_name = 'product_variants' AND column_name = 'retailPriceNgn'
        ) THEN
          ALTER TABLE "product_variants" RENAME COLUMN "retailPriceNgn" TO "priceNgn";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
           WHERE table_name = 'product_variants' AND column_name = 'retailPriceUsd'
        ) THEN
          ALTER TABLE "product_variants" RENAME COLUMN "retailPriceUsd" TO "priceUsd";
        END IF;
      END $$;
    `);
  }
}
