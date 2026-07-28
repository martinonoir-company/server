"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateAppSettings1713500260000 = void 0;
class CreateAppSettings1713500260000 {
    constructor() {
        this.name = 'CreateAppSettings1713500260000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app_settings" (
        "key"        varchar(100) NOT NULL,
        "value"      jsonb        NOT NULL,
        "updatedAt"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedBy"  varchar(26),
        CONSTRAINT "PK_app_settings" PRIMARY KEY ("key")
      );
    `);
    }
    async down() {
    }
}
exports.CreateAppSettings1713500260000 = CreateAppSettings1713500260000;
//# sourceMappingURL=1713500260000-CreateAppSettings.js.map