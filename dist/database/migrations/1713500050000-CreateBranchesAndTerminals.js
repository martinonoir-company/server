"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateBranchesAndTerminals1713500050000 = void 0;
class CreateBranchesAndTerminals1713500050000 {
    constructor() {
        this.name = 'CreateBranchesAndTerminals1713500050000';
    }
    async up(queryRunner) {
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
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_branches_code"
        ON "branches" ("code")
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_branches_warehouseCode"
        ON "branches" ("warehouseCode")
    `);
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
        const hqBranchRows = await queryRunner.query(`SELECT id FROM "branches" WHERE "code" = 'HQ' AND "deletedAt" IS NULL LIMIT 1`);
        let hqBranchId;
        if (hqBranchRows.length === 0) {
            hqBranchId = generateUlid();
            await queryRunner.query(`INSERT INTO "branches"
           ("id", "code", "name", "warehouseCode", "isActive")
         VALUES ($1, 'HQ', 'Headquarters', 'DEFAULT', true)`, [hqBranchId]);
        }
        else {
            hqBranchId = hqBranchRows[0].id;
        }
        const terminalRows = await queryRunner.query(`SELECT id FROM "terminals" WHERE "code" = 'POS-MAIN-01' AND "deletedAt" IS NULL LIMIT 1`);
        if (terminalRows.length === 0) {
            const terminalId = generateUlid();
            await queryRunner.query(`INSERT INTO "terminals"
           ("id", "code", "name", "branchId", "isActive")
         VALUES ($1, 'POS-MAIN-01', 'Counter 1', $2, true)`, [terminalId, hqBranchId]);
        }
        const usersToAssign = await queryRunner.query(`SELECT u.id
         FROM "users" u
         LEFT JOIN "user_branches" ub
           ON ub."userId" = u.id
           AND ub."branchId" = $1
           AND ub."deletedAt" IS NULL
        WHERE u.role IN ('SUPER_ADMIN', 'COMPANY_SUPER_ADMIN', 'COMPANY_STAFF')
          AND u."deletedAt" IS NULL
          AND ub.id IS NULL`, [hqBranchId]);
        for (const row of usersToAssign) {
            await queryRunner.query(`INSERT INTO "user_branches"
           ("id", "userId", "branchId")
         VALUES ($1, $2, $3)`, [generateUlid(), row.id, hqBranchId]);
        }
    }
    async down(queryRunner) {
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
exports.CreateBranchesAndTerminals1713500050000 = CreateBranchesAndTerminals1713500050000;
function generateUlid() {
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
    const { randomBytes } = require('crypto');
    const rb = randomBytes(10);
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
//# sourceMappingURL=1713500050000-CreateBranchesAndTerminals.js.map