import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting, SETTING_KEYS } from './entities/app-setting.entity';
import { DEFAULT_WHOLESALE_MIN_QTY } from '../../shared/constants/wholesale';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSetting)
    private readonly repo: Repository<AppSetting>,
  ) {}

  /** Raw value for a key, or null if unset. */
  async get(key: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { key } });
    return row?.value ?? null;
  }

  /** Upsert a key's value. */
  async set(key: string, value: string, updatedBy?: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { key } });
    if (existing) {
      existing.value = value;
      existing.updatedBy = updatedBy ?? null;
      await this.repo.save(existing);
    } else {
      await this.repo.save(
        this.repo.create({ key, value, updatedBy: updatedBy ?? null }),
      );
    }
  }

  /**
   * Wholesale minimum order quantity. Reads the admin-set value, falling back
   * to the built-in default when unset or invalid. Always returns an integer
   * ≥ 1 so callers can trust it.
   */
  async getWholesaleMinQty(): Promise<number> {
    const raw = await this.get(SETTING_KEYS.WHOLESALE_MIN_QTY);
    const n = raw != null ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(n) || n < 1) return DEFAULT_WHOLESALE_MIN_QTY;
    return Math.floor(n);
  }

  async setWholesaleMinQty(qty: number, updatedBy?: string): Promise<number> {
    const v = Math.max(1, Math.floor(qty));
    await this.set(SETTING_KEYS.WHOLESALE_MIN_QTY, String(v), updatedBy);
    return v;
  }

  /** Public config surface consumed by the storefront + mobile app. */
  async getPublicConfig(): Promise<{ wholesaleMinQty: number }> {
    return { wholesaleMinQty: await this.getWholesaleMinQty() };
  }
}
