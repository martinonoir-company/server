import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Versioned copy of what SearchBootstrapService used to do at runtime:
 *   - pg_trgm extension (typo tolerance + trigram indexes)
 *   - products.search_vector generated tsvector column
 *   - GIN index on search_vector (websearch_to_tsquery path)
 *   - GIN trigram index on lower(name) (fuzzy fallback)
 *
 * The service is kept as a runtime safety net so a fresh DB (e.g. CI)
 * still comes up without manually running migrations, but from now on
 * every structural change lives here and is versioned.
 */
export class ProductSearchInfrastructure1713500010000 implements MigrationInterface {
  name = 'ProductSearchInfrastructure1713500010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // A GENERATED STORED column's expression must be IMMUTABLE. Two quirks:
    //   1. `to_tsvector(text, text)` is STABLE (config name resolved via
    //      search_path). The `regconfig` overload is IMMUTABLE — hence the
    //      `'simple'::regconfig` cast.
    //   2. `array_to_string` is STABLE (locale-sensitive), so we can't use it
    //      to turn "a,b,c" into "a b c". `regexp_replace(..., ',', ' ', 'g')`
    //      is IMMUTABLE and equivalent for our purposes.
    await queryRunner.query(`
      ALTER TABLE "products"
        ADD COLUMN IF NOT EXISTS "search_vector" tsvector
          GENERATED ALWAYS AS (
            setweight(to_tsvector('simple'::regconfig, coalesce("name", '')), 'A') ||
            setweight(to_tsvector('simple'::regconfig, coalesce("shortDescription", '')), 'B') ||
            setweight(to_tsvector('simple'::regconfig, coalesce("description", '')), 'C') ||
            setweight(
              to_tsvector(
                'simple'::regconfig,
                coalesce(regexp_replace("tags", ',', ' ', 'g'), '')
              ),
              'B'
            )
          ) STORED
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "products_search_vector_gin" ON "products" USING GIN ("search_vector")`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "products_name_trgm_gin" ON "products" USING GIN (lower("name") gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "products_name_trgm_gin"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "products_search_vector_gin"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "search_vector"`);
    // Intentionally NOT dropping the pg_trgm extension — other features may rely on it.
  }
}
