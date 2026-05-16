import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `payments` table — the single source of truth for payment
 * and transaction records across the storefront, mobile app, and POS.
 *
 * Each row is one payment attempt against an order. An order can have
 * multiple rows (split POS payments, retries after a failure). The order
 * is fully paid when the sum of SUCCEEDED rows >= grandTotal.
 *
 * Before this, "payment records" were just Order rows with paymentMethod
 * columns — there was no real ledger.
 */
export class CreatePaymentsTable1713500140000 implements MigrationInterface {
  name = 'CreatePaymentsTable1713500140000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payments" (
        "id"                varchar(26)  NOT NULL,
        "createdAt"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt"         TIMESTAMP WITH TIME ZONE,
        "orderId"           varchar(26)  NOT NULL,
        "orderNumber"       varchar(20)  NOT NULL,
        "provider"          varchar(20)  NOT NULL,
        "channel"           varchar(20)  NOT NULL,
        "method"            varchar(20)  NOT NULL,
        "status"            varchar(20)  NOT NULL DEFAULT 'PENDING',
        "amount"            bigint       NOT NULL,
        "currency"          varchar(3)   NOT NULL DEFAULT 'NGN',
        "merchantReference" varchar(64)  NOT NULL,
        "providerReference" varchar(128),
        "terminalSerial"    varchar(64),
        "checkoutUrl"       varchar(512),
        "gatewayResponse"   varchar(300),
        "failureReason"     varchar(300),
        "paidAt"            TIMESTAMP WITH TIME ZONE,
        "rawProviderData"   jsonb,
        "rawWebhook"        jsonb,
        "createdBy"         varchar(26),
        CONSTRAINT "PK_payments" PRIMARY KEY ("id")
      )
    `);

    // Unique merchant reference — our idempotency key. A retried call with
    // the same reference can never create a second provider transaction.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payments_merchantReference"
         ON "payments" ("merchantReference")`,
    );
    // Fast lookup of all payments for an order (sum of SUCCEEDED rows).
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payments_orderId"
         ON "payments" ("orderId")`,
    );
    // Provider reference lookup — used when reconciling webhooks.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payments_providerReference"
         ON "payments" ("providerReference")`,
    );

    // FK to orders — a deleted order cascades to its payment rows.
    await queryRunner.query(`
      ALTER TABLE "payments"
        ADD CONSTRAINT "FK_payments_order"
        FOREIGN KEY ("orderId") REFERENCES "orders"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "FK_payments_order"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_providerReference"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_orderId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_payments_merchantReference"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
  }
}
