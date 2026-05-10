import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Locks the new scanner-related permission grants into the `roles` table:
 *
 *   COMPANY_STAFF        + inventory:adjust   (PR #4)
 *   COMPANY_SUPER_ADMIN  + branches:manage    (PR #1, retroactive sync)
 *   SUPER_ADMIN          + branches:manage    (PR #1, retroactive sync)
 *
 * The role definitions in `SYSTEM_ROLES` (role.entity.ts) reflect the
 * desired state, but the existing seed (`seed-roles.ts`) is not invoked
 * on application boot — so editing the source list alone does not change
 * the database. This migration is the durable, idempotent path:
 *
 *  - Safe to re-run: each grant uses a "where the permission is not yet
 *    present" predicate.
 *  - No-op when a role row does not exist yet (fresh install without any
 *    seeded roles): we log and continue rather than failing the migration.
 *  - Forward-compatible: when `seed-roles.ts` IS run, it will upsert the
 *    same permission set; results converge.
 *
 * The migration touches only the `roles.permissions` jsonb array. It does
 * not modify any user record, role membership, or other column.
 */
export class GrantScannerPermissionsToRoles1713500070000
  implements MigrationInterface
{
  name = 'GrantScannerPermissionsToRoles1713500070000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const grants: Array<{ roleName: string; permission: string }> = [
      { roleName: 'COMPANY_STAFF', permission: 'inventory:adjust' },
      { roleName: 'COMPANY_SUPER_ADMIN', permission: 'branches:manage' },
      { roleName: 'SUPER_ADMIN', permission: 'branches:manage' },
    ];

    for (const { roleName, permission } of grants) {
      // Only update rows where the permission is NOT already present in
      // the jsonb array. The `?` operator (`WHERE permissions ? 'foo'`)
      // checks for top-level array membership of a string element.
      // We append via jsonb concatenation (`||`) which preserves the
      // existing array order.
      const result = (await queryRunner.query(
        `UPDATE "roles"
            SET "permissions" = COALESCE("permissions", '[]'::jsonb) || to_jsonb($1::text)
          WHERE "name" = $2
            AND ("permissions" IS NULL
                 OR NOT ("permissions" ? $1::text))
          RETURNING "id"`,
        [permission, roleName],
      )) as Array<{ id: string }>;

      if (result.length > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `  ✓ Granted "${permission}" to role "${roleName}" (${result.length} row${result.length === 1 ? '' : 's'} updated)`,
        );
      } else {
        // eslint-disable-next-line no-console
        console.log(
          `  · Role "${roleName}" already has "${permission}" or row missing — no update`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse the grants. Use jsonb_path operations to remove the specific
    // string element from the array.
    const grants: Array<{ roleName: string; permission: string }> = [
      { roleName: 'COMPANY_STAFF', permission: 'inventory:adjust' },
      { roleName: 'COMPANY_SUPER_ADMIN', permission: 'branches:manage' },
      { roleName: 'SUPER_ADMIN', permission: 'branches:manage' },
    ];

    for (const { roleName, permission } of grants) {
      await queryRunner.query(
        `UPDATE "roles"
            SET "permissions" = COALESCE(
              (
                SELECT jsonb_agg(elem)
                  FROM jsonb_array_elements_text("permissions") AS elem
                 WHERE elem <> $1
              ),
              '[]'::jsonb
            )
          WHERE "name" = $2
            AND "permissions" ? $1::text`,
        [permission, roleName],
      );
    }
  }
}
