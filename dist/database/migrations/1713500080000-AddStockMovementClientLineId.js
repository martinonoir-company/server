"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddStockMovementClientLineId1713500080000 = void 0;
class AddStockMovementClientLineId1713500080000 {
    constructor() {
        this.name = 'AddStockMovementClientLineId1713500080000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "stock_movements"
        ADD COLUMN IF NOT EXISTS "clientLineId" varchar(36)
    `);
        await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_stock_movements_clientLineId"
        ON "stock_movements" ("clientLineId")
        WHERE "clientLineId" IS NOT NULL
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_stock_movements_clientLineId"`);
        await queryRunner.query(`ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "clientLineId"`);
    }
}
exports.AddStockMovementClientLineId1713500080000 = AddStockMovementClientLineId1713500080000;
//# sourceMappingURL=1713500080000-AddStockMovementClientLineId.js.map