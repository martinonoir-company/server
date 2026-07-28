import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class GrantScannerPermissionsToRoles1713500070000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
