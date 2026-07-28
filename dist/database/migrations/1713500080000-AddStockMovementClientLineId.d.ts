import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class AddStockMovementClientLineId1713500080000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
