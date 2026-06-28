/**
 * The `app_settings` key/value table is shared with the agents module and
 * predates a TypeORM entity for it (shape: key PK, value jsonb, updatedAt,
 * updatedBy). SettingsService reads/writes it with raw SQL, so there is no
 * entity class here — only the known setting keys.
 */
export const SETTING_KEYS = {
  WHOLESALE_MIN_QTY: 'wholesale_min_qty',
} as const;
