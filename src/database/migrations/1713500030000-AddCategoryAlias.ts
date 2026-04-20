import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `Category.alias` was added to the entity after synchronize was switched
 * off, so the column never landed in any DB that hadn't re-synchronized.
 * Loading `product.category` (e.g. via the wishlist `relations: ['product.category']`
 * query) then crashes with:
 *   column "<auto-alias>.alias" does not exist
 *
 * This migration brings the table back in sync with the entity.
 */
export class AddCategoryAlias1713500030000 implements MigrationInterface {
  name = 'AddCategoryAlias1713500030000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "categories"
        ADD COLUMN IF NOT EXISTS "alias" varchar(200)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "categories" DROP COLUMN IF EXISTS "alias"
    `);
  }
}
