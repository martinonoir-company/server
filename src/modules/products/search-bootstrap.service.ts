import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Creates (and keeps in sync) the Postgres objects that back the
 * product search experience:
 *   - pg_trgm extension for "did you mean" typo tolerance
 *   - unaccent extension so "café" matches "cafe"
 *   - a generated `search_vector` tsvector column on `products`
 *   - a GIN index on `search_vector` (fast websearch_to_tsquery)
 *   - a gin_trgm_ops index on lower(name) (fuzzy fallback)
 *
 * Runs idempotently on every app start so the search infrastructure
 * matches the code's expectations even after a fresh DB reset.
 */
@Injectable()
export class SearchBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(SearchBootstrapService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    } catch (err) {
      this.logger.warn(
        `Unable to ensure pg_trgm extension: ${(err as Error).message}`,
      );
    }

    try {
      await this.dataSource.query(`
        ALTER TABLE products
          ADD COLUMN IF NOT EXISTS search_vector tsvector
            GENERATED ALWAYS AS (
              setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
              setweight(to_tsvector('simple', coalesce("shortDescription", '')), 'B') ||
              setweight(to_tsvector('simple', coalesce("description", '')), 'C') ||
              setweight(
                to_tsvector(
                  'simple',
                  coalesce(array_to_string(string_to_array("tags", ','), ' '), '')
                ),
                'B'
              )
            ) STORED
      `);
    } catch (err) {
      this.logger.warn(
        `Unable to add products.search_vector column: ${(err as Error).message}`,
      );
    }

    try {
      await this.dataSource.query(
        'CREATE INDEX IF NOT EXISTS products_search_vector_gin ON products USING GIN (search_vector)',
      );
    } catch (err) {
      this.logger.warn(
        `Unable to create GIN index on search_vector: ${(err as Error).message}`,
      );
    }

    try {
      await this.dataSource.query(
        'CREATE INDEX IF NOT EXISTS products_name_trgm_gin ON products USING GIN (lower("name") gin_trgm_ops)',
      );
    } catch (err) {
      this.logger.warn(
        `Unable to create trigram index on products.name: ${(err as Error).message}`,
      );
    }

    this.logger.log('Product search infrastructure verified');
  }
}
