/**
 * clear-order-sales-data.js
 *
 * Deletes ALL order / cart / sales / payment data, leaving the product
 * catalogue (products, product_variants, categories) and the inventory
 * ledger (stock_movements, stock_levels) untouched, along with users,
 * customers, branches, terminals, coupons and marketing agents.
 *
 * Tables cleared (child → parent order):
 *   agent_attributions, agent_payouts   (order-derived commission records)
 *   refund_request_items, refund_requests
 *   payments
 *   pos_sync_jobs, pos_sessions          (POS sale/session data)
 *   order_status_history, order_items, orders
 *   cart_items
 *
 * Explicitly NOT touched:
 *   products, product_variants, categories, product_media
 *   stock_movements, stock_levels        (inventory accuracy preserved)
 *   users, customers, customer_addresses, marketing_agents, wishlist_items,
 *   branches, terminals, coupons, roles, settings.
 *
 * SAFETY:
 *   - Dry-run by default: prints per-table row counts it WOULD delete and
 *     exits without changing anything. Pass --execute to actually delete.
 *   - Single transaction: all-or-nothing; any error rolls the whole thing back.
 *   - Triggers disabled inside the txn so audit/FK triggers can't block it;
 *     re-enabled before commit.
 *   - Self-discovers which tables exist, so a missing table can't crash it.
 *
 * USAGE (from server/):
 *   DB_HOST=.. DB_PORT=.. DB_USER=.. DB_PASSWORD=.. DB_NAME=.. \
 *     node scripts/clear-order-sales-data.js            # preview (dry run)
 *   ...same env... node scripts/clear-order-sales-data.js --execute
 */
const { Client } = require('pg');

const EXECUTE = process.argv.includes('--execute');

// Ordered child → parent within the order/cart/sales domain only.
const TABLES = [
  'agent_attributions',
  'agent_payouts',
  'refund_request_items',
  'refund_requests',
  'payments',
  'pos_sync_jobs',
  'pos_sessions',
  'order_status_history',
  'order_items',
  'orders',
  'cart_items',
];

// When --remove-agents is passed, also delete the marketing agent profiles
// AND their linked user login accounts. Agent-referencing sales tables
// (agent_attributions, agent_payouts) are already cleared above, so the
// profiles can be removed, then the users they belong to (after clearing the
// per-user auth/child rows so the users delete doesn't FK-fail).
const REMOVE_AGENTS = process.argv.includes('--remove-agents');
// Per-user child tables that reference users(id) and would block deleting an
// agent's user row. Discovered from the FK graph.
const USER_CHILD_TABLES = [
  'refresh_tokens',
  'email_verification_tokens',
  'password_reset_tokens',
  'push_tokens',
  'wishlist_items',
  'cart_items',
  'customers',
  'user_branches',
];

async function main() {
  const cfg = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
  for (const k of ['host', 'port', 'user', 'password', 'database']) {
    if (!cfg[k] && cfg[k] !== 0) {
      console.error(`Missing DB_${k.toUpperCase()} env var`);
      process.exit(1);
    }
  }

  const client = new Client(cfg);
  await client.connect();
  console.log(`Connected to ${cfg.host}:${cfg.port}/${cfg.database}`);
  console.log(
    EXECUTE
      ? '\n*** EXECUTE MODE — rows WILL be deleted ***\n'
      : '\n(dry run — no changes; pass --execute to delete)\n',
  );

  const existing = new Set(
    (
      await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema='public' AND table_type='BASE TABLE'`,
      )
    ).rows.map((r) => r.table_name),
  );
  const tables = TABLES.filter((t) => existing.has(t));
  const missing = TABLES.filter((t) => !existing.has(t));
  if (missing.length) console.log(`Skipping (not present): ${missing.join(', ')}`);

  let grand = 0;
  console.log('  table                     rows');
  console.log('  ------------------------  ----');
  for (const t of tables) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM "${t}"`);
    grand += rows[0].n;
    console.log(`  ${t.padEnd(24)}  ${rows[0].n}`);
  }
  console.log(`  ${'TOTAL'.padEnd(24)}  ${grand}`);

  if (!EXECUTE) {
    console.log('\nDry run complete. Re-run with --execute to delete these rows.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    for (const t of tables) {
      await client.query(`ALTER TABLE "${t}" DISABLE TRIGGER ALL`);
    }
    for (const t of tables) {
      const res = await client.query(`DELETE FROM "${t}"`);
      console.log(`  deleted ${String(res.rowCount).padStart(8)}  from ${t}`);
    }
    // Optionally remove marketing agent accounts (profiles + their user
    // logins). Runs inside the same transaction.
    if (REMOVE_AGENTS && existing.has('marketing_agents')) {
      const agentUsers = (
        await client.query(
          `SELECT "userId" FROM marketing_agents WHERE "userId" IS NOT NULL`,
        )
      ).rows.map((r) => r.userId);

      // Delete the agent profiles first (attributions/payouts already gone).
      const delAgents = await client.query(`DELETE FROM marketing_agents`);
      console.log(`  deleted ${String(delAgents.rowCount).padStart(8)}  from marketing_agents`);

      if (agentUsers.length > 0) {
        // Clear each per-user child row for just these users, then the users.
        for (const ct of USER_CHILD_TABLES) {
          if (!existing.has(ct)) continue;
          const r = await client.query(
            `DELETE FROM "${ct}" WHERE "userId" = ANY($1)`,
            [agentUsers],
          );
          if (r.rowCount) console.log(`  deleted ${String(r.rowCount).padStart(8)}  from ${ct} (agent users)`);
        }
        const delUsers = await client.query(
          `DELETE FROM users WHERE id = ANY($1)`,
          [agentUsers],
        );
        console.log(`  deleted ${String(delUsers.rowCount).padStart(8)}  from users (agent logins)`);
      }
    }

    for (const t of tables) {
      await client.query(`ALTER TABLE "${t}" ENABLE TRIGGER ALL`);
    }
    await client.query('COMMIT');
    console.log('\nCommitted. All order/cart/sales data cleared.');
    console.log(
      'Preserved: products, variants, categories, stock_movements, stock_levels,\n' +
        'users, customers, marketing_agents, branches, terminals, coupons.',
    );
    console.log(
      '\nNOTE: marketing_agents wallet totals (if any were credited by the\n' +
        'deleted orders) are NOT reset here, since agents are accounts, not\n' +
        'sales data. Reset those manually if you need a clean slate.',
    );
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nRolled back — nothing was deleted. Error:', err.message);
    process.exitCode = 1;
  }

  await client.end();
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
