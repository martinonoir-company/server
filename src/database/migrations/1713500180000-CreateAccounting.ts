import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Accounting module schema.
 *
 *  - expenses                  — manually-entered business expenses,
 *                                money stored as bigint kobo. Soft-
 *                                delete (deletedAt) so the deletion
 *                                trail is preserved.
 *  - accounting_audit_log      — append-only audit of every mutating
 *                                accounting action. Indexes support the
 *                                Audit page's filter UI.
 *
 * Also grants the two new accounting permissions
 * (accounting:view + accounting:manage) to SUPER_ADMIN and
 * COMPANY_SUPER_ADMIN rows that exist on the upgrade path. New
 * deployments pick them up from the role-seeder catch-all.
 */
export class CreateAccounting1713500180000 implements MigrationInterface {
  name = 'CreateAccounting1713500180000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── expenses ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expenses" (
        "id"               varchar(26)  NOT NULL,
        "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt"        TIMESTAMP WITH TIME ZONE,
        "title"            varchar(200) NOT NULL,
        "category"         varchar(30)  NOT NULL,
        "amountMinor"      bigint       NOT NULL,
        "currency"         varchar(3)   NOT NULL DEFAULT 'NGN',
        "incurredAt"       date         NOT NULL,
        "notes"            text,
        "vendor"           varchar(200),
        "referenceNumber"  varchar(100),
        "createdBy"        varchar(26)  NOT NULL,
        "updatedBy"        varchar(26),
        CONSTRAINT "PK_expenses" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_expenses_amount_positive" CHECK ("amountMinor" > 0)
      );
    `);
    await queryRunner.query(`
      ALTER TABLE "expenses"
        ADD CONSTRAINT "FK_expenses_createdBy"
        FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_expenses_incurredAt" ON "expenses" ("incurredAt" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_expenses_category_incurredAt"
        ON "expenses" ("category", "incurredAt" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_expenses_category" ON "expenses" ("category");
    `);

    // ── accounting_audit_log ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "accounting_audit_log" (
        "id"          varchar(26)  NOT NULL,
        "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt"   TIMESTAMP WITH TIME ZONE,
        "action"      varchar(40)  NOT NULL,
        "entityType"  varchar(50)  NOT NULL,
        "entityId"    varchar(26),
        "actorId"     varchar(26)  NOT NULL,
        "actorLabel"  varchar(200) NOT NULL,
        "payload"     jsonb,
        CONSTRAINT "PK_accounting_audit_log" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      ALTER TABLE "accounting_audit_log"
        ADD CONSTRAINT "FK_accounting_audit_log_actor"
        FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_accounting_audit_log_action_createdAt"
        ON "accounting_audit_log" ("action", "createdAt" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_accounting_audit_log_entity"
        ON "accounting_audit_log" ("entityType", "entityId");
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_accounting_audit_log_action"
        ON "accounting_audit_log" ("action");
    `);

    // ── Patch role permissions ──
    await queryRunner.query(`
      UPDATE "roles" SET "permissions" =
        ("permissions"::jsonb)
        || '["accounting:view","accounting:manage"]'::jsonb
      WHERE "name" IN ('SUPER_ADMIN', 'COMPANY_SUPER_ADMIN')
        AND NOT ("permissions"::jsonb @> '["accounting:view"]'::jsonb);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "roles" SET "permissions" =
        (SELECT jsonb_agg(p) FROM jsonb_array_elements_text("permissions"::jsonb) p
         WHERE p NOT IN ('accounting:view','accounting:manage'))
      WHERE "name" IN ('SUPER_ADMIN','COMPANY_SUPER_ADMIN');
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "accounting_audit_log";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "expenses";`);
  }
}
