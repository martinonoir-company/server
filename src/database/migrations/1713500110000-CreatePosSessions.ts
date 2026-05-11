import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `pos_sessions` (the live POS-terminal cart shared between the
 * POS web app and the scanner) per SCANNER_APP_PLAN.md §4.4, and adds a
 * nullable `branchId` to `orders` so POS-channel orders can record which
 * branch they were sold at (§4.7 / §4.4).
 *
 *   pos_sessions:
 *     - one row per terminal lifecycle; partial unique index ensures only
 *       one ACTIVE/AWAITING_PAYMENT session per terminal at a time.
 *     - cart held as jsonb (POS sales are 1–30 items).
 *     - `version` int for optimistic concurrency.
 *   orders.branchId:
 *     - nullable; existing storefront/admin orders stay NULL. POS-channel
 *       orders created via the session-confirm flow set it. Adding this
 *       column also activates the branch-deletion dependency guard in
 *       BranchesService (which already probes information_schema for it).
 *
 * All additive. Idempotent.
 */
export class CreatePosSessions1713500110000 implements MigrationInterface {
  name = 'CreatePosSessions1713500110000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enum type for session status.
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

    // Only ONE open (ACTIVE or AWAITING_PAYMENT) session per terminal.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pos_sessions_open_terminal"
        ON "pos_sessions" ("terminalId")
        WHERE "status" IN ('ACTIVE', 'AWAITING_PAYMENT') AND "deletedAt" IS NULL
    `);

    // Add orders.branchId (nullable).
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "branchId" varchar(26)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_branchId"
        ON "orders" ("branchId")
        WHERE "branchId" IS NOT NULL
    `);
    // FK is intentionally NOT added here: pre-existing orders have NULL
    // branchId which a FK would tolerate, but we keep the column loosely
    // coupled for now — a NULLable FK to branches can be added later once
    // every active order has a branch. For v1 the index is enough.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_branchId"`);
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "branchId"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_pos_sessions_open_terminal"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pos_sessions_branchId"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_pos_sessions_terminalId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_sessions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "pos_sessions_status_enum"`);
  }
}
