import 'reflect-metadata';
import AppDataSource from '../data-source';
import { User, UserRole } from '../../modules/users/entities/user.entity';
import * as argon2 from 'argon2';

/**
 * Seeds a POS staff user for development/testing.
 * Idempotent — skips if user already exists.
 */
async function seedPosUser() {
  await AppDataSource.initialize();
  console.log('  ✓ Database connected');

  const userRepo = AppDataSource.getRepository(User);

  const email = 'pos@martinonoir.com';
  const password = 'PosStaff2026!';

  const existing = await userRepo.findOne({ where: { email } });
  if (existing) {
    console.log(`  ✓ POS user already exists: ${email}`);
    await AppDataSource.destroy();
    return;
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  const user = userRepo.create({
    firstName: 'POS',
    lastName: 'Staff',
    email,
    passwordHash,
    role: UserRole.COMPANY_STAFF,
    emailVerified: true,
    countryCode: 'NG',
    preferredCurrency: 'NGN',
  });

  await userRepo.save(user);
  console.log(`  + Created POS user:`);
  console.log(`      Email:    ${email}`);
  console.log(`      Password: ${password}`);
  console.log(`      Role:     ${UserRole.COMPANY_STAFF}`);
  console.log(`      ID:       ${user.id}`);

  await AppDataSource.destroy();
  console.log('  ✓ Done');
}

seedPosUser().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
