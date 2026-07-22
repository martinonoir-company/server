/**
 * list-zoho-from-addresses.js
 *
 * Lists the addresses the configured Zoho account is allowed to send from.
 * Use it when a send fails with "Given FromAddress not exists!" to find the
 * correct value for SMTP_FROM.
 *
 * USAGE (from server/):  node scripts/list-zoho-from-addresses.js
 */
require('dotenv').config();
const https = require('https');

const region = process.env['ZOHO_MAIL_REGION'] ?? 'com';
const accountId = process.env['ZOHO_MAIL_ACCOUNT_ID'];

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

(async () => {
  // 1. Refresh an access token (same flow the app uses).
  const body =
    `refresh_token=${encodeURIComponent(process.env['ZOHO_MAIL_REFRESH_TOKEN'])}` +
    `&client_id=${encodeURIComponent(process.env['ZOHO_MAIL_CLIENT_ID'])}` +
    `&client_secret=${encodeURIComponent(process.env['ZOHO_MAIL_CLIENT_SECRET'])}` +
    `&grant_type=refresh_token`;

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
  const token = JSON.parse(tokenRaw).access_token;
  if (!token) {
    console.error('Could not refresh access token:', tokenRaw);
    process.exit(1);
  }
  console.log('Access token refreshed.\n');

  // 2. Fetch account details, which include every sendable address.
  const raw = await request({
    hostname: `mail.zoho.${region}`,
    path: `/api/accounts/${accountId}`,
    method: 'GET',
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error('Unexpected response:', raw.slice(0, 500));
    process.exit(1);
  }

  const data = parsed.data;
  if (!data) {
    console.error('No account data returned:', JSON.stringify(parsed).slice(0, 500));
    process.exit(1);
  }

  const accounts = Array.isArray(data) ? data : [data];
  for (const acc of accounts) {
    console.log(`Account : ${acc.accountName ?? acc.accountId ?? '(unnamed)'}`);
    console.log(`Primary : ${acc.primaryEmailAddress ?? '(none)'}`);
    const list = acc.sendMailDetails ?? [];
    if (list.length === 0) {
      console.log('Sendable addresses: (none reported)');
    } else {
      console.log('Sendable addresses:');
      for (const s of list) {
        const flags = [
          s.default === true || s.default === 'true' ? 'default' : null,
          s.validated === true || s.validated === 'true' ? 'validated' : 'NOT validated',
        ]
          .filter(Boolean)
          .join(', ');
        console.log(`  • ${s.fromAddress}${s.displayName ? ` (${s.displayName})` : ''} — ${flags}`);
      }
    }
    console.log('');
  }

  console.log('Set SMTP_FROM in server/.env to one of the validated addresses above.');
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
