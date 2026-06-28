import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';

/**
 * Generic key-value store for admin-configurable store settings.
 *
 * Keep values as text and parse per-key in the service. One row per setting
 * key (unique). The first consumer is the wholesale minimum order quantity.
 */
@Entity('app_settings')
export class AppSetting extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  key!: string;

  @Column({ type: 'text' })
  value!: string;

  /** Staff user id who last changed the value (audit). */
  @Column({ type: 'varchar', length: 26, nullable: true })
  updatedBy?: string | null;
}

/** Known setting keys. */
export const SETTING_KEYS = {
  WHOLESALE_MIN_QTY: 'wholesale_min_qty',
} as const;
