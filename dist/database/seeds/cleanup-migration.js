"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const data_source_1 = __importDefault(require("../data-source"));
async function cleanup() {
    await data_source_1.default.initialize();
    console.log('Connected. Cleaning up...');
    await data_source_1.default.query('DROP INDEX IF EXISTS "IDX_stock_movements_ref_unique"');
    await data_source_1.default.query('DROP INDEX IF EXISTS "IDX_stock_movements_variantId"');
    await data_source_1.default.query('DROP INDEX IF EXISTS "IDX_stock_levels_variant_warehouse"');
    await data_source_1.default.query('DROP INDEX IF EXISTS "IDX_pos_sync_jobs_transactionId"');
    await data_source_1.default.query('DROP INDEX IF EXISTS "IDX_pos_sync_jobs_status"');
    await data_source_1.default.query('DROP TABLE IF EXISTS "pos_sync_jobs"');
    await data_source_1.default.query('DROP TABLE IF EXISTS "stock_movements"');
    await data_source_1.default.query('DROP TABLE IF EXISTS "stock_levels"');
    await data_source_1.default.query('DROP TYPE IF EXISTS "pos_sync_jobs_status_enum"');
    await data_source_1.default.query('DROP TYPE IF EXISTS "stock_movements_kind_enum"');
    await data_source_1.default.query(`DELETE FROM "typeorm_migrations" WHERE "name" = 'CreateInventoryAndPosTables1713500040000'`);
    console.log('✓ Cleanup done — restart the server to run migration cleanly.');
    await data_source_1.default.destroy();
}
cleanup().catch((e) => {
    console.error('Cleanup failed:', e);
    process.exit(1);
});
//# sourceMappingURL=cleanup-migration.js.map