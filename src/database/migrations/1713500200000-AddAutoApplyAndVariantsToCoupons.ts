import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds variant-level scoping + auto-apply support to coupons.
 *
 *  - applicableVariantIds  jsonb[]   — restrict the discount to
 *                                       specific product variants.
 *                                       Empty = applies to all (same
 *                                       semantics as the existing
 *                                       applicableProductIds /
 *                                       applicableCategoryIds arrays).
 *  - autoApply             boolean   — when true the customer does NOT
 *                                       need to type a code; the cart's
 *                                       auto-apply hook will attach the
 *                                       coupon to any cart with a
 *                                       qualifying line.
 *
 * Both columns default to safe inert values, so the rollout is
 * backwards-compatible: every existing coupon stays code-driven and
 * unrestricted by variant until an admin opts it in.
 *
 * A partial unique check on (autoApply, applicableVariantIds) isn't
 * possible inside Postgres without an expression-trigger, so the
 * admin form enforces "only one auto-apply per variant at a time" UX-side
 * and the auto-apply endpoint deterministically picks the best one
 * (highest discount) when multiple compete.
 */
export class AddAutoApplyAndVariantsToCoupons1713500200000
  implements MigrationInterface
{
  name = 'AddAutoApplyAndVariantsToCoupons1713500200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "coupons"
        ADD COLUMN IF NOT EXISTS "applicableVariantIds" jsonb NOT NULL DEFAULT '[]'::jsonb;
    `);
    await queryRunner.query(`
      ALTER TABLE "coupons"
        ADD COLUMN IF NOT EXISTS "autoApply" boolean NOT NULL DEFAULT false;
    `);
    // Index supports the auto-apply hook's "any auto-apply coupon
    // covering one of these variant ids?" query — a GIN index on the
    // jsonb array gives us containment lookups in microseconds.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_coupons_autoApply"
        ON "coupons" ("autoApply") WHERE "autoApply" = true;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_coupons_applicableVariantIds_gin"
        ON "coupons" USING GIN ("applicableVariantIds");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_coupons_applicableVariantIds_gin";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_coupons_autoApply";
    `);
    await queryRunner.query(`
      ALTER TABLE "coupons" DROP COLUMN IF EXISTS "autoApply";
    `);
    await queryRunner.query(`
      ALTER TABLE "coupons" DROP COLUMN IF EXISTS "applicableVariantIds";
    `);
  }
}
