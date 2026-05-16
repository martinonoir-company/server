import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `moniepointTerminalSerial` to the terminals table.
 *
 * Each POS terminal can be paired with one physical Moniepoint card
 * terminal; card payments at that POS are pushed to that device's serial.
 * Nullable — a POS terminal with no card device simply leaves it unset.
 */
export class AddTerminalMoniepointSerial1713500150000
  implements MigrationInterface
{
  name = 'AddTerminalMoniepointSerial1713500150000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "terminals"
         ADD COLUMN IF NOT EXISTS "moniepointTerminalSerial" varchar(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "terminals" DROP COLUMN IF EXISTS "moniepointTerminalSerial"`,
    );
  }
}
