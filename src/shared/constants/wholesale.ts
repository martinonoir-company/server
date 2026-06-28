/**
 * Default minimum quantity for a wholesale line. This is the fallback used
 * when the super admin hasn't configured a value (see SettingsService).
 * The configured value is authoritative; this only seeds the default.
 */
export const DEFAULT_WHOLESALE_MIN_QTY = 20;

/**
 * @deprecated Use SettingsService.getWholesaleMinQty() for the live value.
 * Retained as the default for any non-async fallback path.
 */
export const MIN_WHOLESALE_QTY = DEFAULT_WHOLESALE_MIN_QTY;
