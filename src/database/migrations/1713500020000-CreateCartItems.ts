import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Server-persisted cart for authenticated users.
 *
 * Shape mirrors the client-side CartItem on the user-frontend (snapshot
 * fields so the cart keeps rendering if the variant is later renamed or
 * deleted). Uniqueness on (userId, variantId) prevents two concurrent adds
 * from producing duplicate rows.
 */
export class CreateCartItems1713500020000 implements MigrationInterface {
  name = 'CreateCartItems1713500020000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cart_items" (
        "id"            varchar(26)  PRIMARY KEY,
        "createdAt"     timestamptz  NOT NULL DEFAULT now(),
        "updatedAt"     timestamptz  NOT NULL DEFAULT now(),
        "deletedAt"     timestamptz,
        "userId"        varchar(26)  NOT NULL,
        "variantId"     varchar(26),
        "productId"     varchar(26),
        "quantity"      int          NOT NULL,
        "productName"   varchar(200) NOT NULL,
        "productSlug"   varchar(200) NOT NULL,
        "variantName"   varchar(200),
        "sku"           varchar(100) NOT NULL,
        "priceNgn"      bigint       NOT NULL,
        "priceUsd"      bigint       NOT NULL,
        "options"       jsonb,
        "imageUrl"      varchar(500),
        CONSTRAINT "FK_cart_items_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cart_items_variant"
          FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_cart_items_product"
          FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cart_user_variant" ON "cart_items" ("userId", "variantId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cart_user" ON "cart_items" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cart_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cart_user_variant"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cart_items"`);
  }
}
