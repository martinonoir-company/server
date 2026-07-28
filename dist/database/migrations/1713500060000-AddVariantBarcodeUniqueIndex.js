"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddVariantBarcodeUniqueIndex1713500060000 = void 0;
class AddVariantBarcodeUniqueIndex1713500060000 {
    constructor() {
        this.name = 'AddVariantBarcodeUniqueIndex1713500060000';
    }
    async up(queryRunner) {
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
    `));
        if (duplicates.length > 0) {
            const summary = duplicates
                .map((d) => `  • barcode "${d.barcode}" used by ${d.count} variants: ${d.ids.join(', ')}`)
                .join('\n');
            throw new Error(`Cannot create unique index on product_variants.barcode — duplicates exist:\n${summary}\n` +
                `Resolve these via the admin UI (clear the barcode on duplicates) and re-run the migration.`);
        }
        await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_product_variants_barcode_active"
        ON "product_variants" ("barcode")
        WHERE "barcode" IS NOT NULL AND "deletedAt" IS NULL
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_variants_barcode"
        ON "product_variants" ("barcode")
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_product_variants_barcode_active"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_variants_barcode"`);
    }
}
exports.AddVariantBarcodeUniqueIndex1713500060000 = AddVariantBarcodeUniqueIndex1713500060000;
//# sourceMappingURL=1713500060000-AddVariantBarcodeUniqueIndex.js.map