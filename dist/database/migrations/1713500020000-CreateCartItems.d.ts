import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class CreateCartItems1713500020000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
