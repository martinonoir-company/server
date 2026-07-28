import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class CreateMarketingAgents1713500170000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
