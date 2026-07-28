"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductSearchInfrastructure1713500010000 = void 0;
class ProductSearchInfrastructure1713500010000 {
    constructor() {
        this.name = 'ProductSearchInfrastructure1713500010000';
    }
    async up(queryRunner) {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
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
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "products_search_vector_gin" ON "products" USING GIN ("search_vector")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "products_name_trgm_gin" ON "products" USING GIN (lower("name") gin_trgm_ops)`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "products_name_trgm_gin"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "products_search_vector_gin"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "search_vector"`);
    }
}
exports.ProductSearchInfrastructure1713500010000 = ProductSearchInfrastructure1713500010000;
//# sourceMappingURL=1713500010000-ProductSearchInfrastructure.js.map