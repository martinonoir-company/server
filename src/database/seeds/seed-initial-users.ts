/**
 * One-shot idempotent seed for the initial SUPER_ADMIN and a baseline
 * CUSTOMER. Run from the server workspace:
 *
 *   SEED_ADMIN_EMAIL=...           SEED_ADMIN_PASSWORD=...     \
 *   SEED_ADMIN_FIRSTNAME=...       SEED_ADMIN_LASTNAME=...     \
 *   SEED_CUSTOMER_EMAIL=...        SEED_CUSTOMER_PASSWORD=...  \
 *   SEED_CUSTOMER_FIRSTNAME=...    SEED_CUSTOMER_LASTNAME=...  \
 *   npm run seed:initial-users
 *
 * Behaviour:
 *  - For each (email, role) pair, look up the user.
 *      · If absent → INSERT with argon2id-hashed password + emailVerified=true.
 *      · If present with a non-deleted row → leave it untouched (no password
 *        clobber, no role demotion). Log "skipped".
 *      · If present but soft-deleted → leave it (likely intentional).
 *  - Uses the SAME argon2id parameters as auth.service.ts so the seeded
 *    users can log in via POST /auth/login identically to a normally-
 *    registered user.
 *  - Reads DB connection from the same .env data-source.ts uses, so
 *    pointing at Railway just means having the Railway DB_* values set.
 *
 * Passwords are NEVER hardcoded — they come from env vars only. The
 * script clears them from process.env after hashing so a stack trace
 * or downstream code can't leak them.
 */
import 'reflect-metadata';
import AppDataSource from '../data-source';
import { User, UserRole } from '../../modules/users/entities/user.entity';
import * as argon2 from 'argon2';

// Same params as ARGON2_OPTIONS in src/modules/auth/auth.service.ts.
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};

interface SeedSpec {
  envPrefix: string;
  role: UserRole;
  defaultFirstName: string;
  defaultLastName: string;
  countryCode: string;
  preferredCurrency: 'NGN' | 'USD';
}

const SPECS: SeedSpec[] = [
  {
    envPrefix: 'SEED_ADMIN',
    role: UserRole.SUPER_ADMIN,
    defaultFirstName: 'Super',
    defaultLastName: 'Admin',
    countryCode: 'NG',
    preferredCurrency: 'NGN',
  },
  {
    envPrefix: 'SEED_CUSTOMER',
    role: UserRole.CUSTOMER,
    defaultFirstName: 'Customer',
    defaultLastName: 'User',
    countryCode: 'NG',
    preferredCurrency: 'NGN',
  },
];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim();
}

function readEnv(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

async function seedOne(spec: SeedSpec): Promise<{
  email: string;
  status: 'CREATED' | 'SKIPPED_EXISTS';
  role: UserRole;
  id?: string;
}> {
  const email = requireEnv(`${spec.envPrefix}_EMAIL`).toLowerCase();
  const password = requireEnv(`${spec.envPrefix}_PASSWORD`);
  const firstName = readEnv(`${spec.envPrefix}_FIRSTNAME`, spec.defaultFirstName);
  const lastName = readEnv(`${spec.envPrefix}_LASTNAME`, spec.defaultLastName);

  const repo = AppDataSource.getRepository(User);

  const existing = await repo
    .createQueryBuilder('u')
    .where('lower(u.email) = :email', { email })
    .getOne();

  if (existing) {
    // Wipe password from env so it can't leak from later code in this process.
    delete process.env[`${spec.envPrefix}_PASSWORD`];
    return { email, status: 'SKIPPED_EXISTS', role: existing.role, id: existing.id };
  }

  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
  // Wipe from env immediately after hashing.
  delete process.env[`${spec.envPrefix}_PASSWORD`];

  const user = repo.create({
    firstName,
    lastName,
    email,
    passwordHash,
    role: spec.role,
    countryCode: spec.countryCode,
    preferredCurrency: spec.preferredCurrency,
    emailVerified: true,
    failedLoginAttempts: 0,
  });
  const saved = await repo.save(user);
  return { email, status: 'CREATED', role: spec.role, id: saved.id };
}

async function main(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  console.log('── Initial user seed ──');
  console.log(
    `Connected: db=${(AppDataSource.options as { database?: string }).database ?? '?'} host=${(AppDataSource.options as { host?: string }).host ?? '?'}`,
  );

  const results: Array<{
    email: string;
    status: 'CREATED' | 'SKIPPED_EXISTS';
    role: UserRole;
    id?: string;
  }> = [];

  for (const spec of SPECS) {
    try {
      const r = await seedOne(spec);
      results.push(r);
      console.log(
        ` ${r.status === 'CREATED' ? '+' : '·'} ${r.role.padEnd(20)} ${r.email}${
          r.status === 'SKIPPED_EXISTS' ? '  (already exists — left untouched)' : ''
        }`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(` × ${spec.envPrefix}: ${msg}`);
      throw err;
    }
  }

  await AppDataSource.destroy();
  console.log('── Done ──');
  console.log(
    'Reminder: rotate the seeded passwords via the apps as soon as you can sign in.',
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
