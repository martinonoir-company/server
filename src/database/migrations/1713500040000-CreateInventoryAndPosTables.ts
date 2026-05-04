import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the tables required by the Inventory Sync Engine and POS module:
 *
 *  1. stock_levels  — materialised on-hand / reserved per variant+warehouse
 *  2. stock_movements — append-only ledger of every stock mutation
 *  3. pos_sync_jobs — retry queue for failed POS transactions
 *
 * All statements use IF NOT EXISTS so the migration is safe to run against
 * databases that were previously managed by `synchronize: true`.
 */
export class CreateInventoryAndPosTables1713500040000 implements MigrationInterface {
  name = 'CreateInventoryAndPosTables1713500040000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. stock_levels ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_levels" (
        "variantId"       varchar(26)   NOT NULL,
        "warehouseCode"   varchar(100)  NOT NULL DEFAULT 'DEFAULT',
        "onHand"          int           NOT NULL DEFAULT 0,
        "reserved"        int           NOT NULL DEFAULT 0,
        "lastMovementAt"  timestamptz   NOT NULL DEFAULT now(),

        CONSTRAINT "PK_stock_levels"
          PRIMARY KEY ("variantId", "warehouseCode"),
        CONSTRAINT "FK_stock_levels_variant"
          FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_stock_levels_variant_warehouse"
        ON "stock_levels" ("variantId", "warehouseCode")
    `);

    // ── 2. stock_movements ──

    // Create the enum type if it doesn't exist
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "stock_movements_kind_enum" AS ENUM (
          'RECEIPT', 'SALE', 'RESERVATION', 'RELEASE',
          'RETURN', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_movements" (
        "id"              varchar(26)   PRIMARY KEY,
        "createdAt"       timestamptz   NOT NULL DEFAULT now(),
        "updatedAt"       timestamptz   NOT NULL DEFAULT now(),
        "deletedAt"       timestamptz,
        "variantId"       varchar(26)   NOT NULL,
        "kind"            "stock_movements_kind_enum" NOT NULL,
        "quantity"        int           NOT NULL,
        "warehouseCode"   varchar(100)  NOT NULL DEFAULT 'DEFAULT',
        "referenceId"     varchar(100),
        "referenceType"   varchar(50),
        "reason"          text,
        "createdBy"       varchar(26),

        CONSTRAINT "FK_stock_movements_variant"
          FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_movements_variantId"
        ON "stock_movements" ("variantId")
    `);

    // Composite unique partial index: idempotency guard
    // First, deduplicate any existing rows (from prior synchronize:true)
    // that would violate the constraint. Keep only the newest row per group.
    await queryRunner.query(`
      DELETE FROM "stock_movements" a
      USING "stock_movements" b
      WHERE a."referenceId" IS NOT NULL
        AND a."referenceId" = b."referenceId"
        AND a."referenceType" = b."referenceType"
        AND a."variantId" = b."variantId"
        AND a."kind" = b."kind"
        AND a."createdAt" < b."createdAt"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_stock_movements_ref_unique"
        ON "stock_movements" ("referenceId", "referenceType", "variantId", "kind")
        WHERE "referenceId" IS NOT NULL
    `);

    // ── 3. pos_sync_jobs ──

    // Create the enum type if it doesn't exist
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "pos_sync_jobs_status_enum" AS ENUM (
          'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_sync_jobs" (
        "id"                    varchar(26)   PRIMARY KEY,
        "createdAt"             timestamptz   NOT NULL DEFAULT now(),
        "updatedAt"             timestamptz   NOT NULL DEFAULT now(),
        "deletedAt"             timestamptz,
        "transactionId"         varchar(64)   NOT NULL,
        "terminalId"            varchar(100)  NOT NULL,
        "transactionPayload"    jsonb         NOT NULL,
        "status"                "pos_sync_jobs_status_enum" NOT NULL DEFAULT 'PENDING',
        "retryCount"            int           NOT NULL DEFAULT 0,
        "errorMessage"          text,
        "orderId"               varchar(26)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pos_sync_jobs_transactionId"
        ON "pos_sync_jobs" ("transactionId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pos_sync_jobs_status"
        ON "pos_sync_jobs" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // pos_sync_jobs
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pos_sync_jobs_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pos_sync_jobs_transactionId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_sync_jobs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "pos_sync_jobs_status_enum"`);

    // stock_movements
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_movements_ref_unique"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_movements_variantId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_movements"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "stock_movements_kind_enum"`);

    // stock_levels
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_levels_variant_warehouse"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_levels"`);
  }
}
