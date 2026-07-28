"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddVariantIdToProductMedia1713500190000 = void 0;
class AddVariantIdToProductMedia1713500190000 {
    constructor() {
        this.name = 'AddVariantIdToProductMedia1713500190000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "product_media"
        ADD COLUMN IF NOT EXISTS "variantId" varchar(26);
    `);
        await queryRunner.query(`
      ALTER TABLE "product_media"
        ADD CONSTRAINT "FK_product_media_variant"
        FOREIGN KEY ("variantId")
        REFERENCES "product_variants"("id")
        ON DELETE CASCADE;
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_media_productId_variantId"
        ON "product_media" ("productId", "variantId");
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_product_media_productId_variantId";
    `);
        await queryRunner.query(`
      ALTER TABLE "product_media"
        DROP CONSTRAINT IF EXISTS "FK_product_media_variant";
    `);
        await queryRunner.query(`
      ALTER TABLE "product_media" DROP COLUMN IF EXISTS "variantId";
    `);
    }
}
exports.AddVariantIdToProductMedia1713500190000 = AddVariantIdToProductMedia1713500190000;
//# sourceMappingURL=1713500190000-AddVariantIdToProductMedia.js.map