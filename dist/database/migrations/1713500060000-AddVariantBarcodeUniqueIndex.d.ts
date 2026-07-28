import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class AddVariantBarcodeUniqueIndex1713500060000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
