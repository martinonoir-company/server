import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ensures every admin-level role can record stock movements.
 *
 * Symptom this fixes: in the admin Inventory page, applying a stock
 * adjustment failed with `POST /inventory/movements 403 Forbidden`.
 * That endpoint requires the `inventory:adjust` permission.
 *
 * Why it was missing:
 *   - The earlier migration `1713500070000-GrantScannerPermissionsToRoles`
 *     granted `inventory:adjust` to COMPANY_STAFF only.
 *   - COMPANY_SUPER_ADMIN is *defined* in SYSTEM_ROLES (role.entity.ts) to
 *     hold every permission, but `seed-roles.ts` is not run on boot — so a
 *     roles table seeded before `INVENTORY_ADJUST` existed never received
 *     it for COMPANY_SUPER_ADMIN.
 *   - SUPER_ADMIN bypasses RBAC entirely, so it is unaffected.
 *
 * This migration grants `inventory:adjust` to both COMPANY_SUPER_ADMIN and
 * COMPANY_STAFF. It is idempotent: a role that already has the permission
 * is skipped, and a missing role row is a logged no-op rather than a
 * failure (mirrors the 1713500070000 pattern).
 */
export class GrantInventoryAdjustToAdminRoles1713500120000
  implements MigrationInterface
{
  name = 'GrantInventoryAdjustToAdminRoles1713500120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const grants: Array<{ roleName: string; permission: string }> = [
      { roleName: 'COMPANY_SUPER_ADMIN', permission: 'inventory:adjust' },
      { roleName: 'COMPANY_STAFF', permission: 'inventory:adjust' },
    ];

    for (const { roleName, permission } of grants) {
      // Append the permission only when it is not already present in the
      // jsonb array. `permissions ? 'foo'` tests top-level array membership.
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
    // Only revoke from COMPANY_SUPER_ADMIN. COMPANY_STAFF's grant is owned
    // by the earlier 1713500070000 migration — reverting this one must not
    // strip a permission that migration is responsible for.
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
      ['inventory:adjust', 'COMPANY_SUPER_ADMIN'],
    );
  }
}
