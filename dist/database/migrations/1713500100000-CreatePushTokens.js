"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatePushTokens1713500100000 = void 0;
class CreatePushTokens1713500100000 {
    constructor() {
        this.name = 'CreatePushTokens1713500100000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "push_tokens_platform_enum" AS ENUM ('ios', 'android');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "push_tokens" (
        "id"             varchar(26)  PRIMARY KEY,
        "createdAt"      timestamptz  NOT NULL DEFAULT now(),
        "updatedAt"      timestamptz  NOT NULL DEFAULT now(),
        "deletedAt"      timestamptz,
        "userId"         varchar(26)  NOT NULL,
        "expoPushToken"  varchar(200) NOT NULL,
        "platform"       "push_tokens_platform_enum",
        "deviceLabel"    varchar(200),
        "isActive"       boolean      NOT NULL DEFAULT true,
        "lastUsedAt"     timestamptz,

        CONSTRAINT "FK_push_tokens_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_push_tokens_userId"
        ON "push_tokens" ("userId")
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_push_tokens_expoPushToken"
        ON "push_tokens" ("expoPushToken")
    `);
        await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_push_tokens_user_token_active"
        ON "push_tokens" ("userId", "expoPushToken")
        WHERE "isActive" = true AND "deletedAt" IS NULL
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_push_tokens_user_token_active"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_push_tokens_expoPushToken"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_push_tokens_userId"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "push_tokens"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "push_tokens_platform_enum"`);
    }
}
exports.CreatePushTokens1713500100000 = CreatePushTokens1713500100000;
//# sourceMappingURL=1713500100000-CreatePushTokens.js.map