"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddCouponApplicableChannels1713500130000 = void 0;
class AddCouponApplicableChannels1713500130000 {
    constructor() {
        this.name = 'AddCouponApplicableChannels1713500130000';
    }
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "coupons"
         ADD COLUMN IF NOT EXISTS "applicableChannels" jsonb NOT NULL DEFAULT '[]'`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN IF EXISTS "applicableChannels"`);
    }
}
exports.AddCouponApplicableChannels1713500130000 = AddCouponApplicableChannels1713500130000;
//# sourceMappingURL=1713500130000-AddCouponApplicableChannels.js.map