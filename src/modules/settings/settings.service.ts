import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SETTING_KEYS } from './entities/app-setting.entity';
import { DEFAULT_WHOLESALE_MIN_QTY } from '../../shared/constants/wholesale';

/**
 * Reads/writes the shared `app_settings` key/value table — the SAME table the
 * agents module uses for the commission rate. That table predates this module
 * and has the shape (key PK, value jsonb, updatedAt, updatedBy) — NO id /
 * createdAt / deletedAt — so we use raw SQL here rather than a TypeORM entity
 * (an entity extending BaseEntity would query a non-existent `id` column).
 */
@Injectable()
export class SettingsService {
  constructor(private readonly dataSource: DataSource) {}

  /** Raw value for a key (parsed from jsonb), or null if unset. */
  async get(key: string): Promise<unknown> {
    const rows = await this.dataSource.query(
      `SELECT "value" FROM "app_settings" WHERE "key" = $1`,
      [key],
    );
    return rows[0]?.value ?? null;
  }

  /** Upsert a key's value (stored as jsonb). */
  async set(key: string, value: unknown, updatedBy?: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO "app_settings" ("key", "value", "updatedAt", "updatedBy")
       VALUES ($1, $2::jsonb, now(), $3)
       ON CONFLICT ("key") DO UPDATE
         SET "value" = EXCLUDED."value",
             "updatedAt" = EXCLUDED."updatedAt",
             "updatedBy" = EXCLUDED."updatedBy"`,
      [key, JSON.stringify(value), updatedBy ?? null],
    );
  }

  /**
   * Wholesale minimum order quantity. Reads the admin-set value, falling back
   * to the built-in default when unset or invalid. Always returns an integer
   * ≥ 1 so callers can trust it.
   */
  async getWholesaleMinQty(): Promise<number> {
    const raw = await this.get(SETTING_KEYS.WHOLESALE_MIN_QTY);
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_WHOLESALE_MIN_QTY;
    return Math.floor(n);
  }

  async setWholesaleMinQty(qty: number, updatedBy?: string): Promise<number> {
    const v = Math.max(1, Math.floor(qty));
    await this.set(SETTING_KEYS.WHOLESALE_MIN_QTY, v, updatedBy);
    return v;
  }

  /** Public config surface consumed by the storefront + mobile app. */
  async getPublicConfig(): Promise<{ wholesaleMinQty: number }> {
    return { wholesaleMinQty: await this.getWholesaleMinQty() };
  }
}
