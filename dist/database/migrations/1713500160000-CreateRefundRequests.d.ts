import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class CreateRefundRequests1713500160000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
