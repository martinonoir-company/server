import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class GrantInventoryAdjustToAdminRoles1713500120000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
