import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class AddMarketingAgentToUserRoleEnum1713500220000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(): Promise<void>;
}
