import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class CreateAccounting1713500180000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
