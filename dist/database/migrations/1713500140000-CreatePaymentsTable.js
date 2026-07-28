"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatePaymentsTable1713500140000 = void 0;
class CreatePaymentsTable1713500140000 {
    constructor() {
        this.name = 'CreatePaymentsTable1713500140000';
    }
    async up(queryRunner) {
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
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payments_merchantReference"
         ON "payments" ("merchantReference")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_payments_orderId"
         ON "payments" ("orderId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_payments_providerReference"
         ON "payments" ("providerReference")`);
        await queryRunner.query(`
      ALTER TABLE "payments"
        ADD CONSTRAINT "FK_payments_order"
        FOREIGN KEY ("orderId") REFERENCES "orders"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "FK_payments_order"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_providerReference"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_orderId"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_payments_merchantReference"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    }
}
exports.CreatePaymentsTable1713500140000 = CreatePaymentsTable1713500140000;
//# sourceMappingURL=1713500140000-CreatePaymentsTable.js.map