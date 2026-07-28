"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatePosSessions1713500110000 = void 0;
class CreatePosSessions1713500110000 {
    constructor() {
        this.name = 'CreatePosSessions1713500110000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "pos_sessions_status_enum" AS ENUM (
          'ACTIVE', 'AWAITING_PAYMENT', 'COMPLETED', 'VOIDED'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_sessions" (
        "id"                 varchar(26)  PRIMARY KEY,
        "createdAt"          timestamptz  NOT NULL DEFAULT now(),
        "updatedAt"          timestamptz  NOT NULL DEFAULT now(),
        "deletedAt"          timestamptz,
        "terminalId"         varchar(26)  NOT NULL,
        "branchId"           varchar(26)  NOT NULL,
        "openedByStaffId"    varchar(26)  NOT NULL,
        "status"             "pos_sessions_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "cart"               jsonb        NOT NULL,
        "version"            int          NOT NULL DEFAULT 0,
        "openedAt"           timestamptz  NOT NULL DEFAULT now(),
        "closedAt"           timestamptz,
        "resultOrderNumber"  varchar(20),
        "resultOrderId"      varchar(26),

        CONSTRAINT "FK_pos_sessions_terminal"
          FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_pos_sessions_branch"
          FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_pos_sessions_staff"
          FOREIGN KEY ("openedByStaffId") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pos_sessions_terminalId"
        ON "pos_sessions" ("terminalId")
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pos_sessions_branchId"
        ON "pos_sessions" ("branchId")
    `);
        await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pos_sessions_open_terminal"
        ON "pos_sessions" ("terminalId")
        WHERE "status" IN ('ACTIVE', 'AWAITING_PAYMENT') AND "deletedAt" IS NULL
    `);
        await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "branchId" varchar(26)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_branchId"
        ON "orders" ("branchId")
        WHERE "branchId" IS NOT NULL
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_branchId"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "branchId"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_pos_sessions_open_terminal"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pos_sessions_branchId"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pos_sessions_terminalId"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "pos_sessions"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "pos_sessions_status_enum"`);
    }
}
exports.CreatePosSessions1713500110000 = CreatePosSessions1713500110000;
//# sourceMappingURL=1713500110000-CreatePosSessions.js.map