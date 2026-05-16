import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `applicableChannels` to the coupons table.
 *
 * A coupon (promotion) can be restricted to specific sales channels —
 * STOREFRONT (web), MOBILE (storefront app), POS. An empty array means
 * "all channels". Existing coupons get an empty array, so they continue
 * to apply everywhere with no behaviour change.
 */
export class AddCouponApplicableChannels1713500130000
  implements MigrationInterface
{
  name = 'AddCouponApplicableChannels1713500130000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "coupons"
         ADD COLUMN IF NOT EXISTS "applicableChannels" jsonb NOT NULL DEFAULT '[]'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "coupons" DROP COLUMN IF EXISTS "applicableChannels"`,
    );
  }
}
