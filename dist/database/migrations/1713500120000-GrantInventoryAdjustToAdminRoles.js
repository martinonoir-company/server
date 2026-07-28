"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrantInventoryAdjustToAdminRoles1713500120000 = void 0;
class GrantInventoryAdjustToAdminRoles1713500120000 {
    constructor() {
        this.name = 'GrantInventoryAdjustToAdminRoles1713500120000';
    }
    async up(queryRunner) {
        const grants = [
            { roleName: 'COMPANY_SUPER_ADMIN', permission: 'inventory:adjust' },
            { roleName: 'COMPANY_STAFF', permission: 'inventory:adjust' },
        ];
        for (const { roleName, permission } of grants) {
            const result = (await queryRunner.query(`UPDATE "roles"
            SET "permissions" = COALESCE("permissions", '[]'::jsonb) || to_jsonb($1::text)
          WHERE "name" = $2
            AND ("permissions" IS NULL
                 OR NOT ("permissions" ? $1::text))
          RETURNING "id"`, [permission, roleName]));
            if (result.length > 0) {
                console.log(`  ✓ Granted "${permission}" to role "${roleName}" (${result.length} row${result.length === 1 ? '' : 's'} updated)`);
            }
            else {
                console.log(`  · Role "${roleName}" already has "${permission}" or row missing — no update`);
            }
        }
    }
    async down(queryRunner) {
        await queryRunner.query(`UPDATE "roles"
          SET "permissions" = COALESCE(
            (
              SELECT jsonb_agg(elem)
                FROM jsonb_array_elements_text("permissions") AS elem
               WHERE elem <> $1
            ),
            '[]'::jsonb
          )
        WHERE "name" = $2
          AND "permissions" ? $1::text`, ['inventory:adjust', 'COMPANY_SUPER_ADMIN']);
    }
}
exports.GrantInventoryAdjustToAdminRoles1713500120000 = GrantInventoryAdjustToAdminRoles1713500120000;
//# sourceMappingURL=1713500120000-GrantInventoryAdjustToAdminRoles.js.map