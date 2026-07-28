"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddCategoryAlias1713500030000 = void 0;
class AddCategoryAlias1713500030000 {
    constructor() {
        this.name = 'AddCategoryAlias1713500030000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "categories"
        ADD COLUMN IF NOT EXISTS "alias" varchar(200)
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "categories" DROP COLUMN IF EXISTS "alias"
    `);
    }
}
exports.AddCategoryAlias1713500030000 = AddCategoryAlias1713500030000;
//# sourceMappingURL=1713500030000-AddCategoryAlias.js.map