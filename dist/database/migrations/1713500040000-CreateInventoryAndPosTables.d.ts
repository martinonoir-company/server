import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class CreateInventoryAndPosTables1713500040000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
