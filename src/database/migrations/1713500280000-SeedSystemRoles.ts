import { MigrationInterface, QueryRunner } from 'typeorm';
import { SYSTEM_ROLES } from '../../modules/users/entities/role.entity';
import { generateUlid } from '../../shared/entities/base.entity';

/**
 * Seeds the baseline RBAC roles into the `roles` table.
 *
 * The seed (`seed-roles.ts`) is not run on application boot, so on most
 * environments only whatever roles a prior migration happened to create
 * exist (e.g. MARKETING_AGENT). A COMPANY_STAFF user with no per-user
 * permission override then hit RolesGuard's "Role not configured" 403 —
 * breaking the scanner dispatch queue and other permission-gated screens.
 *
 * RolesGuard now falls back to the in-code SYSTEM_ROLES when a row is
 * missing, so the runtime is already safe. This migration additionally makes
 * the database consistent so the admin staff/role management UI (which reads
 * from `roles`) shows and can edit every system role.
 *
 * Idempotent:
 *  - inserts a row for any SYSTEM_ROLES entry that has no row yet;
 *  - for existing rows, unions in any permissions from SYSTEM_ROLES that are
 *    not already present (never removes admin-granted extras);
 *  - marks all system roles isSystem = true.
 */
export class SeedSystemRoles1713500280000 implements MigrationInterface {
  name = 'SeedSystemRoles1713500280000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const roleDef of SYSTEM_ROLES) {
      const existing = (await queryRunner.query(
        `SELECT "id" FROM "roles" WHERE "name" = $1 LIMIT 1`,
        [roleDef.name],
      )) as Array<{ id: string }>;

      if (existing.length === 0) {
        await queryRunner.query(
          `INSERT INTO "roles" ("id", "name", "description", "permissions", "isSystem")
           VALUES ($1, $2, $3, $4::jsonb, true)`,
          [
            generateUlid(),
            roleDef.name,
            roleDef.description,
            JSON.stringify(roleDef.permissions),
          ],
        );
        // eslint-disable-next-line no-console
        console.log(
          `  + Created role "${roleDef.name}" (${roleDef.permissions.length} permissions)`,
        );
      } else {
        // Union in any missing permissions; keep existing order + extras.
        await queryRunner.query(
          `UPDATE "roles" r
              SET "permissions" = (
                    SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
                      FROM (
                        SELECT jsonb_array_elements_text(r."permissions") AS elem
                        UNION
                        SELECT jsonb_array_elements_text($2::jsonb) AS elem
                      ) merged
                  ),
                  "isSystem" = true,
                  "description" = COALESCE(r."description", $3)
            WHERE r."name" = $1`,
          [roleDef.name, JSON.stringify(roleDef.permissions), roleDef.description],
        );
        // eslint-disable-next-line no-console
        console.log(`  · Synced role "${roleDef.name}"`);
      }
    }
  }

  public async down(): Promise<void> {
    // No-op: removing baseline roles would break authorization for existing
    // staff. Roles are safe to keep.
  }
}
