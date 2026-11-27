import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `order_ratings` table (1–5 star rating + optional comment, one
 * per order) and grants the new `ratings:view` permission to the super-admin
 * roles so the admin Ratings page is visible to them on existing databases.
 *
 * The table is additive — no existing table or flow references it.
 */
export class CreateOrderRatings1713500340000 implements MigrationInterface {
  name = 'CreateOrderRatings1713500340000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_ratings" (
        "id" varchar(26) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "orderId" varchar(26) NOT NULL,
        "userId" varchar(26) NOT NULL,
        "stars" smallint NOT NULL,
        "comment" varchar(1000),
        CONSTRAINT "PK_order_ratings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_order_ratings_order" UNIQUE ("orderId")
      );
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_order_ratings_orderId" ON "order_ratings" ("orderId");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_order_ratings_userId" ON "order_ratings" ("userId");`,
    );

    // FKs mirror the entity (CASCADE on delete) — added guarded so a re-run is
    // safe even though CREATE TABLE already ran.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_order_ratings_order'
        ) THEN
          ALTER TABLE "order_ratings"
            ADD CONSTRAINT "FK_order_ratings_order"
            FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_order_ratings_user'
        ) THEN
          ALTER TABLE "order_ratings"
            ADD CONSTRAINT "FK_order_ratings_user"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // Grant ratings:view to the super-admin roles on existing databases.
    // Idempotent: only adds the permission if it isn't already present.
    await queryRunner.query(`
      UPDATE "roles"
         SET "permissions" = "permissions" || '["ratings:view"]'::jsonb
       WHERE "name" IN ('SUPER_ADMIN', 'COMPANY_SUPER_ADMIN')
         AND NOT ("permissions" @> '["ratings:view"]'::jsonb);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "roles"
         SET "permissions" = "permissions" - 'ratings:view'
       WHERE "name" IN ('SUPER_ADMIN', 'COMPANY_SUPER_ADMIN');
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_ratings";`);
  }
}
