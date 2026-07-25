/**
 * zoho-mail-bootstrap.js
 *
 * One-time setup: turns a Zoho OAuth grant code into the two missing env
 * values — ZOHO_MAIL_REFRESH_TOKEN and ZOHO_MAIL_ACCOUNT_ID — and writes
 * them into server/.env. Requires ZOHO_MAIL_CLIENT_ID and
 * ZOHO_MAIL_CLIENT_SECRET to already be set.
 *
 * How to get a grant code (expires in minutes — run this script right away):
 *   1. Open https://api-console.zoho.com and pick the client that matches
 *      ZOHO_MAIL_CLIENT_ID (usually the "Self Client").
 *   2. Self Client → "Generate Code" tab:
 *        Scope:    ZohoMail.messages.CREATE,ZohoMail.accounts.READ
 *        Duration: 10 minutes
 *   3. Copy the generated code.
 *
 * USAGE (from server/):
 *   node scripts/zoho-mail-bootstrap.js <grant-code>
 *   node scripts/zoho-mail-bootstrap.js <grant-code> --redirect-uri <uri>
 *     (--redirect-uri only for Server-based clients, where the code came from
 *      a browser redirect; must match the URI registered in the API console)
 */
require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');

const region = process.env['ZOHO_MAIL_REGION'] ?? 'com';
const clientId = process.env['ZOHO_MAIL_CLIENT_ID'];
const clientSecret = process.env['ZOHO_MAIL_CLIENT_SECRET'];

const args = process.argv.slice(2);
const code = args.find((a) => !a.startsWith('--'));
const redirectIdx = args.indexOf('--redirect-uri');
const redirectUri = redirectIdx !== -1 ? args[redirectIdx + 1] : null;

if (!clientId || !clientSecret) {
  console.error('ZOHO_MAIL_CLIENT_ID / ZOHO_MAIL_CLIENT_SECRET missing from .env');
  process.exit(1);
}
if (!code) {
  console.error('Usage: node scripts/zoho-mail-bootstrap.js <grant-code> [--redirect-uri <uri>]');
  console.error('Generate the code at https://api-console.zoho.com (see header comment).');
  process.exit(1);
}

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (body) req.write(body);
    req.end();
  });
}

function upsertEnv(envPath, key, value) {
  let content = fs.readFileSync(envPath, 'utf8');
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  content = re.test(content) ? content.replace(re, line) : `${content.replace(/\n?$/, '\n')}${line}\n`;
  fs.writeFileSync(envPath, content);
}

(async () => {
  // 1. Exchange the grant code for tokens.
  let body =
    `code=${encodeURIComponent(code)}` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&client_secret=${encodeURIComponent(clientSecret)}` +
    `&grant_type=authorization_code`;
  if (redirectUri) body += `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  const tokenRaw = await request(
    {
      hostname: `accounts.zoho.${region}`,
      path: '/oauth/v2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body,
  );

  const tokens = JSON.parse(tokenRaw);
  if (!tokens.refresh_token) {
    console.error('Token exchange failed:', tokenRaw);
    if (tokens.error === 'invalid_code') {
      console.error('\nThe grant code is expired or already used — generate a fresh one and retry.');
    } else if (tokens.error === 'invalid_client') {
      console.error(
        `\nClient not recognized on accounts.zoho.${region}. If your Zoho account lives in ` +
          'another datacenter (eu/in/com.au/jp), set ZOHO_MAIL_REGION accordingly and retry.',
      );
    } else if (tokens.access_token && !tokens.refresh_token) {
      console.error(
        '\nGot an access token but no refresh token. Re-generate the grant code; for ' +
          'server-based clients make sure the auth URL includes access_type=offline.',
      );
    }
    process.exit(1);
  }
  console.log('Refresh token obtained.');

  // 2. Discover the mail account ID with the fresh access token.
  const accountsRaw = await request({
    hostname: `mail.zoho.${region}`,
    path: '/api/accounts',
    method: 'GET',
    headers: { Authorization: `Zoho-oauthtoken ${tokens.access_token}` },
  });

  let accounts;
  try {
    accounts = JSON.parse(accountsRaw).data;
  } catch {
    console.error('Unexpected /api/accounts response:', accountsRaw.slice(0, 500));
    process.exit(1);
  }
  if (!Array.isArray(accounts) || accounts.length === 0) {
    console.error('No mail accounts returned:', accountsRaw.slice(0, 500));
    process.exit(1);
  }

  for (const acc of accounts) {
    console.log(`\nAccount: ${acc.accountName ?? '(unnamed)'}`);
    console.log(`  accountId : ${acc.accountId}`);
    console.log(`  primary   : ${acc.primaryEmailAddress ?? '(none)'}`);
    for (const s of acc.sendMailDetails ?? []) {
      console.log(`  sendable  : ${s.fromAddress}`);
    }
  }

  const chosen = accounts[0];
  console.log(`\nUsing accountId ${chosen.accountId} (first account).`);

  // 3. Persist both values into .env.
  const envPath = path.join(__dirname, '..', '.env');
  upsertEnv(envPath, 'ZOHO_MAIL_ACCOUNT_ID', chosen.accountId);
  upsertEnv(envPath, 'ZOHO_MAIL_REFRESH_TOKEN', tokens.refresh_token);
  console.log(`Wrote ZOHO_MAIL_ACCOUNT_ID and ZOHO_MAIL_REFRESH_TOKEN to ${envPath}`);

  console.log('\nNext steps:');
  console.log('  1. Make sure SMTP_FROM matches a sendable address listed above.');
  console.log('  2. Verify end-to-end:  node scripts/send-test-email.js');
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
