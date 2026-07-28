import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class CreateAppSettings1713500260000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(): Promise<void>;
}
