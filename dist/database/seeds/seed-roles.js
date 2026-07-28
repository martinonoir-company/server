"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedRoles = seedRoles;
const role_entity_1 = require("../../modules/users/entities/role.entity");
async function seedRoles(dataSource) {
    const roleRepo = dataSource.getRepository(role_entity_1.Role);
    for (const roleDef of role_entity_1.SYSTEM_ROLES) {
        const existing = await roleRepo.findOne({ where: { name: roleDef.name } });
        if (existing) {
            existing.permissions = roleDef.permissions;
            existing.description = roleDef.description;
            existing.isSystem = true;
            await roleRepo.save(existing);
            console.log(`  ✓ Updated role: ${roleDef.name} (${roleDef.permissions.length} permissions)`);
        }
        else {
            const role = roleRepo.create({
                name: roleDef.name,
                description: roleDef.description,
                permissions: roleDef.permissions,
                isSystem: true,
            });
            await roleRepo.save(role);
            console.log(`  + Created role: ${roleDef.name} (${roleDef.permissions.length} permissions)`);
        }
    }
}
//# sourceMappingURL=seed-roles.js.map