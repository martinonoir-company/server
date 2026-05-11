import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `push_tokens` for the storefront mobile app's Expo Push
 * notification integration (SCANNER_APP_PLAN.md §4.8 / PR #7).
 *
 * One row per (user, device). A user may have multiple active devices.
 * `isActive` flips to false when Expo returns DeviceNotRegistered for
 * the token; the row is preserved for audit. A partial unique index on
 * (userId, expoPushToken) WHERE isActive AND deletedAt IS NULL allows
 * the same user to re-register a token after deactivation.
 *
 * All additive. Idempotent.
 */
export class CreatePushTokens1713500100000 implements MigrationInterface {
  name = 'CreatePushTokens1713500100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enum type for platform.
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

    // Active uniqueness — the same (user, token) cannot have two active
    // rows. Once deactivated (DeviceNotRegistered) or soft-deleted, the
    // user can re-register fresh.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_push_tokens_user_token_active"
        ON "push_tokens" ("userId", "expoPushToken")
        WHERE "isActive" = true AND "deletedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_push_tokens_user_token_active"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_push_tokens_expoPushToken"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_push_tokens_userId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "push_tokens"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "push_tokens_platform_enum"`);
  }
}
