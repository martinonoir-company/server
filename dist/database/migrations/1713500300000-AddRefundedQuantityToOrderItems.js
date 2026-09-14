"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddRefundedQuantityToOrderItems1713500300000 = void 0;
class AddRefundedQuantityToOrderItems1713500300000 {
    constructor() {
        this.name = 'AddRefundedQuantityToOrderItems1713500300000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "order_items"
        ADD COLUMN IF NOT EXISTS "refundedQuantity" integer NOT NULL DEFAULT 0;
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "order_items" DROP COLUMN IF EXISTS "refundedQuantity";
    `);
    }
}
exports.AddRefundedQuantityToOrderItems1713500300000 = AddRefundedQuantityToOrderItems1713500300000;
//# sourceMappingURL=1713500300000-AddRefundedQuantityToOrderItems.js.map