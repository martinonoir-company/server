import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the branches / terminals / user_branches tables and bootstraps a
 * default `HQ` branch + `POS-MAIN-01` terminal so the existing POS keeps
 * working the moment this migration deploys. Existing privileged users are
 * idempotently assigned to HQ.
 *
 * Soft-delete (deletedAt) is the only deletion path; partial unique indexes
 * permit code reuse after deletion. All statements use IF NOT EXISTS /
 * upserts and are safe to re-run.
 */
export class CreateBranchesAndTerminals1713500050000 implements MigrationInterface {
  name = 'CreateBranchesAndTerminals1713500050000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. branches ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "branches" (
        "id"             varchar(26)  PRIMARY KEY,
        "createdAt"      timestamptz  NOT NULL DEFAULT now(),
        "updatedAt"      timestamptz  NOT NULL DEFAULT now(),
        "deletedAt"      timestamptz,
        "code"           varchar(50)  NOT NULL,
        "name"           varchar(200) NOT NULL,
        "warehouseCode"  varchar(100) NOT NULL,
        "address"        jsonb,
        "phone"          varchar(30),
        "isActive"       boolean      NOT NULL DEFAULT true
      )
    `);

    // Active uniqueness — partial unique indexes so deleted codes can be reused.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_branches_code_active"
        ON "branches" ("code")
        WHERE "deletedAt" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_branches_warehouseCode_active"
        ON "branches" ("warehouseCode")
        WHERE "deletedAt" IS NULL
    `);
    // Convenience indexes for non-active lookups (history queries).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_branches_code"
        ON "branches" ("code")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_branches_warehouseCode"
        ON "branches" ("warehouseCode")
    `);

    // ── 2. terminals ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "terminals" (
        "id"          varchar(26)  PRIMARY KEY,
        "createdAt"   timestamptz  NOT NULL DEFAULT now(),
        "updatedAt"   timestamptz  NOT NULL DEFAULT now(),
        "deletedAt"   timestamptz,
        "code"        varchar(50)  NOT NULL,
        "name"        varchar(200) NOT NULL,
        "branchId"    varchar(26)  NOT NULL,
        "isActive"    boolean      NOT NULL DEFAULT true,

        CONSTRAINT "FK_terminals_branch"
          FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_terminals_code_active"
        ON "terminals" ("code")
        WHERE "deletedAt" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_terminals_code"
        ON "terminals" ("code")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_terminals_branchId"
        ON "terminals" ("branchId")
    `);

    // ── 3. user_branches ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_branches" (
        "id"          varchar(26)  PRIMARY KEY,
        "createdAt"   timestamptz  NOT NULL DEFAULT now(),
        "updatedAt"   timestamptz  NOT NULL DEFAULT now(),
        "deletedAt"   timestamptz,
        "userId"      varchar(26)  NOT NULL,
        "branchId"    varchar(26)  NOT NULL,

        CONSTRAINT "FK_user_branches_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_branches_branch"
          FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_branches_pair_active"
        ON "user_branches" ("userId", "branchId")
        WHERE "deletedAt" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_branches_userId"
        ON "user_branches" ("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_branches_branchId"
        ON "user_branches" ("branchId")
    `);

    // ─────────────────────────────────────────────────────────────
    //  BOOTSTRAP — HQ branch, POS-MAIN-01 terminal, staff assignments.
    //  Idempotent: re-running is a no-op.
    // ─────────────────────────────────────────────────────────────

    // ULID generation in pure SQL is awkward, so we generate IDs in JS only
    // when the seed rows don't already exist.
    const hqBranchRows = await queryRunner.query(
      `SELECT id FROM "branches" WHERE "code" = 'HQ' AND "deletedAt" IS NULL LIMIT 1`,
    );
    let hqBranchId: string;

    if (hqBranchRows.length === 0) {
      hqBranchId = generateUlid();
      await queryRunner.query(
        `INSERT INTO "branches"
           ("id", "code", "name", "warehouseCode", "isActive")
         VALUES ($1, 'HQ', 'Headquarters', 'DEFAULT', true)`,
        [hqBranchId],
      );
    } else {
      hqBranchId = hqBranchRows[0].id;
    }

    const terminalRows = await queryRunner.query(
      `SELECT id FROM "terminals" WHERE "code" = 'POS-MAIN-01' AND "deletedAt" IS NULL LIMIT 1`,
    );
    if (terminalRows.length === 0) {
      const terminalId = generateUlid();
      await queryRunner.query(
        `INSERT INTO "terminals"
           ("id", "code", "name", "branchId", "isActive")
         VALUES ($1, 'POS-MAIN-01', 'Counter 1', $2, true)`,
        [terminalId, hqBranchId],
      );
    }

    // Assign every existing privileged user to HQ (idempotent).
    const usersToAssign = await queryRunner.query(
      `SELECT u.id
         FROM "users" u
         LEFT JOIN "user_branches" ub
           ON ub."userId" = u.id
           AND ub."branchId" = $1
           AND ub."deletedAt" IS NULL
        WHERE u.role IN ('SUPER_ADMIN', 'COMPANY_SUPER_ADMIN', 'COMPANY_STAFF')
          AND u."deletedAt" IS NULL
          AND ub.id IS NULL`,
      [hqBranchId],
    );

    for (const row of usersToAssign as Array<{ id: string }>) {
      await queryRunner.query(
        `INSERT INTO "user_branches"
           ("id", "userId", "branchId")
         VALUES ($1, $2, $3)`,
        [generateUlid(), row.id, hqBranchId],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse dependency order. The bootstrap rows are removed with
    // the tables — there is no separate "unseed" step.
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_branches_branchId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_branches_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_user_branches_pair_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_branches"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_terminals_branchId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_terminals_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_terminals_code_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "terminals"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_branches_warehouseCode"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_branches_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_branches_warehouseCode_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_branches_code_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "branches"`);
  }
}

// ─── Local ULID generator (mirror of shared/entities/base.entity.ts) ───
// Migrations cannot import application code (compiled separately), so we
// inline the generator here. The output format and entropy match.
function generateUlid(): string {
  const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const ENCODING_LEN = ENCODING.length;
  const TIME_LEN = 10;
  const RANDOM_LEN = 16;

  const now = Date.now();
  let str = '';

  let t = now;
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    str = ENCODING[t % ENCODING_LEN] + str;
    t = Math.floor(t / ENCODING_LEN);
  }

  // Use Node's crypto for randomness in migration context.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomBytes } = require('crypto');
  const rb: Buffer = randomBytes(10);
  for (let i = 0; i < RANDOM_LEN; i++) {
    const byteIndex = Math.floor((i * 5) / 8);
    const bitOffset = (i * 5) % 8;
    let val = (rb[byteIndex] >> (8 - bitOffset - 5)) & 0x1f;
    if (bitOffset > 3 && byteIndex + 1 < rb.length) {
      val |= (rb[byteIndex + 1] >> (16 - bitOffset - 5)) & 0x1f;
    }
    str += ENCODING[val & 0x1f];
  }

  return str;
}
