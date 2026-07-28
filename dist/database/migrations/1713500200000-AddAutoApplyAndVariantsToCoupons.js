"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddAutoApplyAndVariantsToCoupons1713500200000 = void 0;
class AddAutoApplyAndVariantsToCoupons1713500200000 {
    constructor() {
        this.name = 'AddAutoApplyAndVariantsToCoupons1713500200000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "coupons"
        ADD COLUMN IF NOT EXISTS "applicableVariantIds" jsonb NOT NULL DEFAULT '[]'::jsonb;
    `);
        await queryRunner.query(`
      ALTER TABLE "coupons"
        ADD COLUMN IF NOT EXISTS "autoApply" boolean NOT NULL DEFAULT false;
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_coupons_autoApply"
        ON "coupons" ("autoApply") WHERE "autoApply" = true;
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_coupons_applicableVariantIds_gin"
        ON "coupons" USING GIN ("applicableVariantIds");
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_coupons_applicableVariantIds_gin";
    `);
        await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_coupons_autoApply";
    `);
        await queryRunner.query(`
      ALTER TABLE "coupons" DROP COLUMN IF EXISTS "autoApply";
    `);
        await queryRunner.query(`
      ALTER TABLE "coupons" DROP COLUMN IF EXISTS "applicableVariantIds";
    `);
    }
}
exports.AddAutoApplyAndVariantsToCoupons1713500200000 = AddAutoApplyAndVariantsToCoupons1713500200000;
//# sourceMappingURL=1713500200000-AddAutoApplyAndVariantsToCoupons.js.map