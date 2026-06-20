import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add an optional `variantId` to `product_media` so admins can attach
 * images to a specific product variant. Existing rows keep variantId
 * NULL → they continue to be product-level (the unchanged behaviour).
 *
 * The (productId, variantId) index supports the read path used by the
 * storefront and mobile PDP: "fetch media for product X, optionally
 * filtered to variant Y, ordered by sortOrder".
 */
export class AddVariantIdToProductMedia1713500190000
  implements MigrationInterface
{
  name = 'AddVariantIdToProductMedia1713500190000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_media"
        ADD COLUMN IF NOT EXISTS "variantId" varchar(26);
    `);
    // CASCADE so deleting a variant removes its bespoke images. Existing
    // product-level rows (variantId NULL) are untouched.
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

  public async down(queryRunner: QueryRunner): Promise<void> {
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
