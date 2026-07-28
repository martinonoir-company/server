"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RenameVariantPriceColumns1713500000000 = void 0;
class RenameVariantPriceColumns1713500000000 {
    constructor() {
        this.name = 'RenameVariantPriceColumns1713500000000';
    }
    async up(queryRunner) {
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
        await queryRunner.query(`
      ALTER TABLE "product_variants"
        ADD COLUMN IF NOT EXISTS "wholesalePriceNgn" bigint,
        ADD COLUMN IF NOT EXISTS "wholesalePriceUsd" bigint
    `);
        await queryRunner.query(`
      UPDATE "product_variants"
         SET "wholesalePriceNgn" = COALESCE("wholesalePriceNgn", "retailPriceNgn"),
             "wholesalePriceUsd" = COALESCE("wholesalePriceUsd", "retailPriceUsd")
    `);
        await queryRunner.query(`
      ALTER TABLE "product_variants"
        ALTER COLUMN "wholesalePriceNgn" SET NOT NULL,
        ALTER COLUMN "wholesalePriceUsd" SET NOT NULL
    `);
    }
    async down(queryRunner) {
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
exports.RenameVariantPriceColumns1713500000000 = RenameVariantPriceColumns1713500000000;
//# sourceMappingURL=1713500000000-RenameVariantPriceColumns.js.map