import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add MARKETING_AGENT to the Postgres `users_role_enum` type.
 *
 * The marketing-agents migration (1713500170000) added MARKETING_AGENT
 * to the TypeScript UserRole enum and created the roles-table row, but
 * it never altered the Postgres enum backing `users.role`. As a result
 * every query that reads or writes a MARKETING_AGENT user failed with
 *   invalid input value for enum users_role_enum: "MARKETING_AGENT"
 * — which broke agent signup and agent login.
 *
 * `ADD VALUE IF NOT EXISTS` is idempotent (safe to re-run) and, on
 * Postgres 12+, is permitted inside a transaction provided the new
 * value is not USED in the same transaction. This migration only adds
 * the value, so it is transaction-safe under TypeORM's default
 * per-migration transaction.
 */
export class AddMarketingAgentToUserRoleEnum1713500220000
  implements MigrationInterface
{
  name = 'AddMarketingAgentToUserRoleEnum1713500220000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'MARKETING_AGENT';
    `);
  }

  public async down(): Promise<void> {
    // Postgres cannot drop a value from an enum type without recreating
    // the type, which would require rewriting every column that uses it.
    // Removing MARKETING_AGENT is not worth that risk; the value is inert
    // when unused. Intentionally a no-op.
  }
}
