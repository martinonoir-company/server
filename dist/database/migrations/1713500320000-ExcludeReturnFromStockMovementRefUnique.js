"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExcludeReturnFromStockMovementRefUnique1713500320000 = void 0;
class ExcludeReturnFromStockMovementRefUnique1713500320000 {
    constructor() {
        this.name = 'ExcludeReturnFromStockMovementRefUnique1713500320000';
    }
    async up(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_movements_ref_unique";`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_e572a492b1723d71b00ec47e91";`);
        await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_stock_movements_ref_unique"
        ON "stock_movements" ("referenceId", "referenceType", "variantId", "kind")
        WHERE "referenceId" IS NOT NULL AND "kind" <> 'RETURN';
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_movements_ref_unique";`);
        await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_stock_movements_ref_unique"
        ON "stock_movements" ("referenceId", "referenceType", "variantId", "kind")
        WHERE "referenceId" IS NOT NULL;
    `);
    }
}
exports.ExcludeReturnFromStockMovementRefUnique1713500320000 = ExcludeReturnFromStockMovementRefUnique1713500320000;
//# sourceMappingURL=1713500320000-ExcludeReturnFromStockMovementRefUnique.js.map