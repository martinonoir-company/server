import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marketing-agents module schema.
 *
 *  - app_settings              — tiny key/value store for the global
 *                                agent-commission rate (and any future
 *                                runtime settings).
 *  - marketing_agents          — per-agent profile, wallet totals, bank.
 *  - agent_attributions        — per-order commission line, FSM in status.
 *  - agent_payouts             — per-agent payout run, Paystack transfer.
 *  - orders.agentCode          — referral code captured at checkout, used
 *                                by the PAID hook to mint an attribution.
 *
 * Also grants the new agent-management permissions to SUPER_ADMIN and
 * COMPANY_SUPER_ADMIN rows, and inserts the MARKETING_AGENT role (with
 * just the agent:self capability).
 *
 * Designed to be safe on a fresh DB and on the upgrade path:
 *   - All CREATE TABLEs use IF NOT EXISTS.
 *   - The permission patch uses jsonb-contains guards (idempotent).
 *   - The role insert uses ON CONFLICT DO NOTHING.
 */
export class CreateMarketingAgents1713500170000 implements MigrationInterface {
  name = 'CreateMarketingAgents1713500170000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── app_settings ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app_settings" (
        "key"        varchar(100) NOT NULL,
        "value"      jsonb        NOT NULL,
        "updatedAt"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedBy"  varchar(26),
        CONSTRAINT "PK_app_settings" PRIMARY KEY ("key")
      );
    `);
    // Default global commission rate = 5% (500 bps). Super admin can
    // change this from the agents module.
    await queryRunner.query(`
      INSERT INTO "app_settings" ("key", "value")
      VALUES ('agent_commission_rate_bps', '500'::jsonb)
      ON CONFLICT ("key") DO NOTHING;
    `);

    // ── orders.agentCode ──
    await queryRunner.query(`
      ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "agentCode" varchar(16);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_agentCode" ON "orders" ("agentCode");
    `);

    // ── marketing_agents ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "marketing_agents" (
        "id"                     varchar(26)  NOT NULL,
        "createdAt"              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt"              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt"              TIMESTAMP WITH TIME ZONE,
        "userId"                 varchar(26)  NOT NULL,
        "code"                   varchar(16)  NOT NULL,
        "bankCode"               varchar(10)  NOT NULL,
        "bankAccountNumber"      varchar(20)  NOT NULL,
        "bankAccountName"        varchar(200) NOT NULL,
        "transferRecipientCode"  varchar(100),
        "status"                 varchar(30)  NOT NULL DEFAULT 'PENDING_APPROVAL',
        "decidedBy"              varchar(26),
        "decidedAt"              TIMESTAMP WITH TIME ZONE,
        "decisionReason"         text,
        "commissionRateBps"      integer,
        "walletBalanceMinor"     bigint       NOT NULL DEFAULT 0,
        "lifetimeEarnedMinor"    bigint       NOT NULL DEFAULT 0,
        "lifetimePaidMinor"      bigint       NOT NULL DEFAULT 0,
        CONSTRAINT "PK_marketing_agents" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      ALTER TABLE "marketing_agents"
        ADD CONSTRAINT "FK_marketing_agents_user"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_marketing_agents_userId"
        ON "marketing_agents" ("userId");
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_marketing_agents_code"
        ON "marketing_agents" ("code");
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_marketing_agents_status"
        ON "marketing_agents" ("status");
    `);

    // ── agent_attributions ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_attributions" (
        "id"                  varchar(26)  NOT NULL,
        "createdAt"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt"           TIMESTAMP WITH TIME ZONE,
        "agentId"             varchar(26)  NOT NULL,
        "agentCode"           varchar(16)  NOT NULL,
        "orderId"             varchar(26)  NOT NULL,
        "orderNumber"         varchar(20)  NOT NULL,
        "orderTotalMinor"     bigint       NOT NULL,
        "commissionRateBps"   integer      NOT NULL,
        "commissionMinor"     bigint       NOT NULL,
        "currency"            varchar(3)   NOT NULL DEFAULT 'NGN',
        "status"              varchar(20)  NOT NULL DEFAULT 'PENDING',
        "channel"             varchar(20)  NOT NULL,
        "earnedAt"            TIMESTAMP WITH TIME ZONE,
        "reversedAt"          TIMESTAMP WITH TIME ZONE,
        "payoutId"            varchar(26),
        CONSTRAINT "PK_agent_attributions" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      ALTER TABLE "agent_attributions"
        ADD CONSTRAINT "FK_agent_attributions_agent"
        FOREIGN KEY ("agentId") REFERENCES "marketing_agents"("id") ON DELETE RESTRICT;
    `);
    await queryRunner.query(`
      ALTER TABLE "agent_attributions"
        ADD CONSTRAINT "FK_agent_attributions_order"
        FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT;
    `);
    // One attribution per order — orders cannot be double-credited.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_agent_attributions_orderId"
        ON "agent_attributions" ("orderId");
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_agent_attributions_agent_status_createdAt"
        ON "agent_attributions" ("agentId", "status", "createdAt" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_agent_attributions_agentId"
        ON "agent_attributions" ("agentId");
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_agent_attributions_status"
        ON "agent_attributions" ("status");
    `);

    // ── agent_payouts ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_payouts" (
        "id"                     varchar(26)  NOT NULL,
        "createdAt"              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt"              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt"              TIMESTAMP WITH TIME ZONE,
        "agentId"                varchar(26)  NOT NULL,
        "amountMinor"            bigint       NOT NULL,
        "currency"               varchar(3)   NOT NULL DEFAULT 'NGN',
        "attributionCount"       integer      NOT NULL,
        "status"                 varchar(20)  NOT NULL DEFAULT 'PENDING',
        "bankCode"               varchar(10)  NOT NULL,
        "bankAccountNumber"      varchar(20)  NOT NULL,
        "bankAccountName"        varchar(200) NOT NULL,
        "providerReference"      varchar(100),
        "transferRecipientCode"  varchar(100),
        "failureReason"          text,
        "paidAt"                 TIMESTAMP WITH TIME ZONE,
        "initiatedBy"            varchar(26)  NOT NULL,
        "periodStart"            TIMESTAMP WITH TIME ZONE,
        "periodEnd"              TIMESTAMP WITH TIME ZONE,
        "rawProviderData"        jsonb,
        CONSTRAINT "PK_agent_payouts" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      ALTER TABLE "agent_payouts"
        ADD CONSTRAINT "FK_agent_payouts_agent"
        FOREIGN KEY ("agentId") REFERENCES "marketing_agents"("id") ON DELETE RESTRICT;
    `);
    await queryRunner.query(`
      ALTER TABLE "agent_attributions"
        ADD CONSTRAINT "FK_agent_attributions_payout"
        FOREIGN KEY ("payoutId") REFERENCES "agent_payouts"("id") ON DELETE SET NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_agent_payouts_agentId_createdAt"
        ON "agent_payouts" ("agentId", "createdAt" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_agent_payouts_providerReference"
        ON "agent_payouts" ("providerReference");
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_agent_payouts_status"
        ON "agent_payouts" ("status");
    `);

    // ── Patch roles ──
    await queryRunner.query(`
      UPDATE "roles" SET "permissions" =
        ("permissions"::jsonb)
        || '["agents:view","agents:approve","agents:payout","agents:commission_set"]'::jsonb
      WHERE "name" IN ('SUPER_ADMIN', 'COMPANY_SUPER_ADMIN')
        AND NOT ("permissions"::jsonb @> '["agents:view"]'::jsonb);
    `);

    // Marketing-agent role (just agent:self). Idempotent on name.
    await queryRunner.query(`
      INSERT INTO "roles" ("id", "name", "description", "permissions", "isSystem")
      VALUES (
        '01J000000000000000000AGENT',
        'MARKETING_AGENT',
        'Marketing agent — agent dashboard access only',
        '["agent:self"]'::jsonb,
        true
      )
      ON CONFLICT ("name") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "roles" WHERE "name" = 'MARKETING_AGENT';`);
    await queryRunner.query(`
      UPDATE "roles" SET "permissions" =
        (SELECT jsonb_agg(p) FROM jsonb_array_elements_text("permissions"::jsonb) p
         WHERE p NOT IN ('agents:view','agents:approve','agents:payout','agents:commission_set'))
      WHERE "name" IN ('SUPER_ADMIN','COMPANY_SUPER_ADMIN');
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_payouts" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_attributions" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "marketing_agents" CASCADE;`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "agentCode";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "app_settings";`);
  }
}
