/**
 * Minimum quantity for a wholesale line. Enforced on the storefront, the
 * mobile app (client-side UX), and authoritatively on the server at quote
 * and checkout. Keep this the single source of truth; the clients mirror
 * the value but the server is the gate.
 */
export const MIN_WHOLESALE_QTY = 20;
