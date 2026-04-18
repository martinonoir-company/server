import { DataSource } from 'typeorm';
import { Role, SYSTEM_ROLES } from '../../modules/users/entities/role.entity';

/**
 * Seeds the baseline RBAC roles into the database.
 * Idempotent — skips roles that already exist.
 */
export async function seedRoles(dataSource: DataSource): Promise<void> {
  const roleRepo = dataSource.getRepository(Role);

  for (const roleDef of SYSTEM_ROLES) {
    const existing = await roleRepo.findOne({ where: { name: roleDef.name } });

    if (existing) {
      // Update permissions if role exists (in case new permissions were added)
      existing.permissions = roleDef.permissions;
      existing.description = roleDef.description;
      existing.isSystem = true;
      await roleRepo.save(existing);
      console.log(`  ✓ Updated role: ${roleDef.name} (${roleDef.permissions.length} permissions)`);
    } else {
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
