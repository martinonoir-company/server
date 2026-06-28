import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ensures the shared `app_settings` key/value table exists for the settings
 * module. This table is ALSO created by the marketing-agents migration
 * (1713500170000) with the same shape — key PK, value jsonb, updatedAt,
 * updatedBy. Both use CREATE TABLE IF NOT EXISTS so whichever runs first
 * wins and the other is a no-op. Kept here so a fresh DB that somehow skips
 * the agents migration still has the table for SettingsService.
 *
 * IMPORTANT: the shape must match the agents migration exactly (no id /
 * createdAt / deletedAt). SettingsService uses raw SQL against it.
 */
export class CreateAppSettings1713500260000 implements MigrationInterface {
  name = 'CreateAppSettings1713500260000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app_settings" (
        "key"        varchar(100) NOT NULL,
        "value"      jsonb        NOT NULL,
        "updatedAt"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedBy"  varchar(26),
        CONSTRAINT "PK_app_settings" PRIMARY KEY ("key")
      );
    `);
  }

  public async down(): Promise<void> {
    // No-op: the table is shared with the agents module; dropping it here
    // would break commission settings. Leave it in place.
  }
}
