"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateRefundRequests1713500160000 = void 0;
class CreateRefundRequests1713500160000 {
    constructor() {
        this.name = 'CreateRefundRequests1713500160000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refund_requests" (
        "id"                     varchar(26)  NOT NULL,
        "createdAt"              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt"              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt"              TIMESTAMP WITH TIME ZONE,
        "orderId"                varchar(26)  NOT NULL,
        "originalPaymentId"      varchar(26),
        "channel"                varchar(20)  NOT NULL,
        "amount"                 bigint       NOT NULL,
        "currency"               varchar(3)   NOT NULL DEFAULT 'NGN',
        "itemsCount"             integer      NOT NULL DEFAULT 0,
        "status"                 varchar(30)  NOT NULL DEFAULT 'PENDING',
        "method"                 varchar(30)  NOT NULL,
        "reason"                 text,
        "requestedBy"            varchar(26),
        "decidedBy"              varchar(26),
        "decidedAt"              TIMESTAMP WITH TIME ZONE,
        "decisionReason"         text,
        "bankCode"               varchar(10),
        "bankAccountNumber"      varchar(20),
        "bankAccountName"        varchar(200),
        "providerReference"      varchar(100),
        "transferRecipientCode"  varchar(100),
        "failureReason"          text,
        "refundedAt"             TIMESTAMP WITH TIME ZONE,
        "rawProviderData"        jsonb,
        CONSTRAINT "PK_refund_requests" PRIMARY KEY ("id")
      );
    `);
        await queryRunner.query(`
      ALTER TABLE "refund_requests"
        ADD CONSTRAINT "FK_refund_requests_order"
        FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT;
    `);
        await queryRunner.query(`
      ALTER TABLE "refund_requests"
        ADD CONSTRAINT "FK_refund_requests_payment"
        FOREIGN KEY ("originalPaymentId") REFERENCES "payments"("id") ON DELETE SET NULL;
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_refund_requests_status_createdAt"
        ON "refund_requests" ("status", "createdAt" DESC);
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_refund_requests_orderId"
        ON "refund_requests" ("orderId");
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_refund_requests_status"
        ON "refund_requests" ("status");
    `);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refund_request_items" (
        "id"               varchar(26)  NOT NULL,
        "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt"        TIMESTAMP WITH TIME ZONE,
        "refundRequestId"  varchar(26)  NOT NULL,
        "orderItemId"      varchar(26),
        "variantId"        varchar(26)  NOT NULL,
        "productName"      varchar(200) NOT NULL,
        "variantName"      varchar(200),
        "sku"              varchar(100) NOT NULL,
        "quantity"         integer      NOT NULL,
        "unitPrice"        bigint       NOT NULL,
        "lineTotal"        bigint       NOT NULL,
        "reasonCode"       varchar(100),
        "reasonNote"       text,
        "stockMovementId"  varchar(26),
        CONSTRAINT "PK_refund_request_items" PRIMARY KEY ("id")
      );
    `);
        await queryRunner.query(`
      ALTER TABLE "refund_request_items"
        ADD CONSTRAINT "FK_refund_request_items_refund"
        FOREIGN KEY ("refundRequestId") REFERENCES "refund_requests"("id") ON DELETE CASCADE;
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_refund_request_items_refundRequestId"
        ON "refund_request_items" ("refundRequestId");
    `);
        await queryRunner.query(`
      UPDATE "roles" SET "permissions" =
        ("permissions"::jsonb)
        || '["refunds:view","refunds:process","pos:refund_cash"]'::jsonb
      WHERE "name" IN ('SUPER_ADMIN', 'COMPANY_SUPER_ADMIN')
        AND NOT ("permissions"::jsonb @> '["refunds:view"]'::jsonb);
    `);
        await queryRunner.query(`
      UPDATE "roles" SET "permissions" =
        ("permissions"::jsonb)
        || '["pos:refund_cash"]'::jsonb
      WHERE "name" = 'COMPANY_STAFF'
        AND NOT ("permissions"::jsonb @> '["pos:refund_cash"]'::jsonb);
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      UPDATE "roles" SET "permissions" =
        (SELECT jsonb_agg(p) FROM jsonb_array_elements_text("permissions"::jsonb) p
         WHERE p NOT IN ('refunds:view','refunds:process','pos:refund_cash'))
      WHERE "name" IN ('SUPER_ADMIN','COMPANY_SUPER_ADMIN','COMPANY_STAFF');
    `);
        await queryRunner.query(`DROP TABLE IF EXISTS "refund_request_items";`);
        await queryRunner.query(`DROP TABLE IF EXISTS "refund_requests";`);
    }
}
exports.CreateRefundRequests1713500160000 = CreateRefundRequests1713500160000;
//# sourceMappingURL=1713500160000-CreateRefundRequests.js.map