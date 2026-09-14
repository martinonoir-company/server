import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Track how many units of each order line have been refunded, so partial
 * refunds (e.g. 2 of 5 units) are represented correctly and the same units
 * cannot be refunded twice across separate refund requests.
 *
 * order_items.refundedQuantity — cumulative units refunded on this line.
 * Defaults to 0; the refund service increments it as refunds are created.
 * Additive with an inert default, so existing rows and every existing
 * checkout / order path are unaffected.
 */
export class AddRefundedQuantityToOrderItems1713500300000
  implements MigrationInterface
{
  name = 'AddRefundedQuantityToOrderItems1713500300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_items"
        ADD COLUMN IF NOT EXISTS "refundedQuantity" integer NOT NULL DEFAULT 0;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_items" DROP COLUMN IF EXISTS "refundedQuantity";
    `);
  }
}
