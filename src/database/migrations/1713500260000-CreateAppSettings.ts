import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Key-value store for admin-configurable store settings (app_settings).
 * First consumer: the wholesale minimum order quantity. Additive — no
 * existing table is touched.
 */
export class CreateAppSettings1713500260000 implements MigrationInterface {
  name = 'CreateAppSettings1713500260000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app_settings" (
        "id" varchar(26) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "key" varchar(100) NOT NULL,
        "value" text NOT NULL,
        "updatedBy" varchar(26),
        CONSTRAINT "PK_app_settings" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_app_settings_key"
        ON "app_settings" ("key");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_app_settings_key";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "app_settings";`);
  }
}
