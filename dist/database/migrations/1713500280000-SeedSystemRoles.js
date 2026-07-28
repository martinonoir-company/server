"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeedSystemRoles1713500280000 = void 0;
const role_entity_1 = require("../../modules/users/entities/role.entity");
const base_entity_1 = require("../../shared/entities/base.entity");
class SeedSystemRoles1713500280000 {
    constructor() {
        this.name = 'SeedSystemRoles1713500280000';
    }
    async up(queryRunner) {
        for (const roleDef of role_entity_1.SYSTEM_ROLES) {
            const existing = (await queryRunner.query(`SELECT "id" FROM "roles" WHERE "name" = $1 LIMIT 1`, [roleDef.name]));
            if (existing.length === 0) {
                await queryRunner.query(`INSERT INTO "roles" ("id", "name", "description", "permissions", "isSystem")
           VALUES ($1, $2, $3, $4::jsonb, true)`, [
                    (0, base_entity_1.generateUlid)(),
                    roleDef.name,
                    roleDef.description,
                    JSON.stringify(roleDef.permissions),
                ]);
                console.log(`  + Created role "${roleDef.name}" (${roleDef.permissions.length} permissions)`);
            }
            else {
                await queryRunner.query(`UPDATE "roles" r
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
            WHERE r."name" = $1`, [roleDef.name, JSON.stringify(roleDef.permissions), roleDef.description]);
                console.log(`  · Synced role "${roleDef.name}"`);
            }
        }
    }
    async down() {
    }
}
exports.SeedSystemRoles1713500280000 = SeedSystemRoles1713500280000;
//# sourceMappingURL=1713500280000-SeedSystemRoles.js.map