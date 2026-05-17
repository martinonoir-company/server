/**
 * Sales-tax handling for product pricing.
 *
 * Business rule: the customer-facing price is tax-inclusive and tax is
 * never shown as a separate line at checkout. When a product/variant is
 * CREATED, a flat 7.5% is added to the entered selling price and the
 * tax-inclusive figure is what the system stores and charges.
 *
 * Important constraints:
 *  - Applied on CREATE only. On edit the stored price is already
 *    tax-inclusive — re-applying would compound (×1.075 each save).
 *  - Applied to SELLING prices only (retail + wholesale). Cost price and
 *    compare-at price are never marked up — cost is what the supplier is
 *    paid; compare-at is a "was" reference price.
 *  - Prices are stored in minor units (kobo/cents) as integers, so the
 *    result is rounded.
 */

/** Flat sales-tax rate added to selling prices on product creation. */
export const SALES_TAX_RATE = 0.075;

/** Multiply a tax-exclusive minor-unit price by (1 + rate); rounded. */
export function addSalesTax(priceMinor: number): number {
  if (!Number.isFinite(priceMinor) || priceMinor <= 0) return priceMinor;
  return Math.round(priceMinor * (1 + SALES_TAX_RATE));
}

/** Apply tax to an optional price — undefined/null passes through. */
export function addSalesTaxOptional(
  priceMinor: number | undefined | null,
): number | undefined {
  if (priceMinor === undefined || priceMinor === null) return undefined;
  return addSalesTax(priceMinor);
}
