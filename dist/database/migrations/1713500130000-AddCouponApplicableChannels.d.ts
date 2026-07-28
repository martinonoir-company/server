import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class AddCouponApplicableChannels1713500130000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
