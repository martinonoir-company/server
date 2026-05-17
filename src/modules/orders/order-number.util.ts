import { EntityManager } from 'typeorm';
import { Order } from './entities/order.entity';

/**
 * Order-number generation.
 *
 * Order numbers look like `<PREFIX>-<YYMMDD>-<00001>` — a daily-resetting
 * 5-digit sequence. The sequence MUST be derived from the database, never
 * from process memory: an in-memory counter resets to 0 on every server
 * restart and then re-mints already-used numbers, violating the UNIQUE
 * index on `orders.orderNumber`.
 *
 * `nextOrderNumber` computes the next number for a prefix by reading the
 * highest existing one for today. `withUniqueOrderNumber` wraps an insert
 * so that a concurrent collision (two checkouts racing on the same
 * sequence) is retried with a freshly recomputed number instead of
 * failing the request.
 */

/** Postgres error code for unique_violation. */
const PG_UNIQUE_VIOLATION = '23505';

/** Date portion (YYMMDD) of an order number, in the server's local time. */
function todayStamp(now = new Date()): string {
  const y = now.getFullYear().toString().slice(-2);
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Compute the next order number for a prefix, based on the highest
 * existing order number for today. Runs on the supplied EntityManager so
 * it participates in the caller's transaction.
 *
 * Soft-deleted orders are included (withDeleted) so a cancelled order's
 * number is never reissued.
 */
export async function nextOrderNumber(
  manager: EntityManager,
  prefix: string,
): Promise<string> {
  const stamp = todayStamp();
  const datePrefix = `${prefix}-${stamp}-`;

  const row = await manager
    .getRepository(Order)
    .createQueryBuilder('o')
    .withDeleted()
    .select('MAX(o.orderNumber)', 'max')
    .where('o.orderNumber LIKE :p', { p: `${datePrefix}%` })
    .getRawOne<{ max: string | null }>();

  let nextSeq = 1;
  if (row?.max) {
    // The sequence is the trailing numeric segment after the last dash.
    const tail = row.max.slice(datePrefix.length);
    const parsed = parseInt(tail, 10);
    if (Number.isFinite(parsed)) nextSeq = parsed + 1;
  }

  return `${datePrefix}${nextSeq.toString().padStart(5, '0')}`;
}

/**
 * Run an order-creating insert with a unique-order-number retry.
 *
 * `build(orderNumber)` is called with a freshly computed order number and
 * must perform the insert (and return whatever the caller needs). If the
 * insert fails on the order-number unique index — a concurrent checkout
 * grabbed the same sequence first — it is retried with a new number.
 * Any other error is rethrown immediately.
 */
export async function withUniqueOrderNumber<T>(
  manager: EntityManager,
  prefix: string,
  build: (orderNumber: string) => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const orderNumber = await nextOrderNumber(manager, prefix);
    try {
      return await build(orderNumber);
    } catch (err) {
      lastErr = err;
      if (isOrderNumberConflict(err)) {
        // A racing checkout took this sequence — recompute and retry.
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/** True when the error is a unique-violation on the order-number index. */
function isOrderNumberConflict(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string }; message?: string };
  const code = e?.code ?? e?.driverError?.code;
  if (code !== PG_UNIQUE_VIOLATION) return false;
  // Only treat the orderNumber index as retryable — a duplicate
  // idempotencyKey or any other unique violation must surface normally.
  const msg = e?.message ?? '';
  return /orderNumber|IDX_59b0c3b34ea0fa5562342f2414/i.test(msg);
}
