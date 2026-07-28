"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddMarketingAgentToUserRoleEnum1713500220000 = void 0;
class AddMarketingAgentToUserRoleEnum1713500220000 {
    constructor() {
        this.name = 'AddMarketingAgentToUserRoleEnum1713500220000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'MARKETING_AGENT';
    `);
    }
    async down() {
    }
}
exports.AddMarketingAgentToUserRoleEnum1713500220000 = AddMarketingAgentToUserRoleEnum1713500220000;
//# sourceMappingURL=1713500220000-AddMarketingAgentToUserRoleEnum.js.map