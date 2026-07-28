import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class AddCategoryAlias1713500030000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
