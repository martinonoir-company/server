"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddTerminalMoniepointSerial1713500150000 = void 0;
class AddTerminalMoniepointSerial1713500150000 {
    constructor() {
        this.name = 'AddTerminalMoniepointSerial1713500150000';
    }
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "terminals"
         ADD COLUMN IF NOT EXISTS "moniepointTerminalSerial" varchar(64)`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "terminals" DROP COLUMN IF EXISTS "moniepointTerminalSerial"`);
    }
}
exports.AddTerminalMoniepointSerial1713500150000 = AddTerminalMoniepointSerial1713500150000;
//# sourceMappingURL=1713500150000-AddTerminalMoniepointSerial.js.map