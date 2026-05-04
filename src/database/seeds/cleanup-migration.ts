import 'reflect-metadata';
import AppDataSource from '../data-source';

/**
 * Cleans up partially-applied migration artifacts so the migration
 * can run cleanly from scratch.
 */
async function cleanup() {
  await AppDataSource.initialize();
  console.log('Connected. Cleaning up...');

  await AppDataSource.query('DROP INDEX IF EXISTS "IDX_stock_movements_ref_unique"');
  await AppDataSource.query('DROP INDEX IF EXISTS "IDX_stock_movements_variantId"');
  await AppDataSource.query('DROP INDEX IF EXISTS "IDX_stock_levels_variant_warehouse"');
  await AppDataSource.query('DROP INDEX IF EXISTS "IDX_pos_sync_jobs_transactionId"');
  await AppDataSource.query('DROP INDEX IF EXISTS "IDX_pos_sync_jobs_status"');
  await AppDataSource.query('DROP TABLE IF EXISTS "pos_sync_jobs"');
  await AppDataSource.query('DROP TABLE IF EXISTS "stock_movements"');
  await AppDataSource.query('DROP TABLE IF EXISTS "stock_levels"');
  await AppDataSource.query('DROP TYPE IF EXISTS "pos_sync_jobs_status_enum"');
  await AppDataSource.query('DROP TYPE IF EXISTS "stock_movements_kind_enum"');
  await AppDataSource.query(
    `DELETE FROM "typeorm_migrations" WHERE "name" = 'CreateInventoryAndPosTables1713500040000'`
  );

  console.log('✓ Cleanup done — restart the server to run migration cleanly.');
  await AppDataSource.destroy();
}

cleanup().catch((e) => {
  console.error('Cleanup failed:', e);
  process.exit(1);
});
