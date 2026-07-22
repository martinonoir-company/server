/**
 * send-test-email.js
 *
 * Sends a REAL test email through the app's own EmailService, using the Zoho
 * Mail credentials in .env. Use it to confirm mail is correctly configured
 * (OAuth refresh token still valid, account id right, From address allowed).
 *
 * It deliberately reuses the compiled EmailService rather than reimplementing
 * the Zoho call, so a success here proves the exact path the app uses in
 * production works — not merely that some credentials exist.
 *
 * USAGE (from server/):
 *   node scripts/send-test-email.js                      # -> temybroder@gmail.com
 *   node scripts/send-test-email.js someone@example.com  # -> explicit recipient
 *
 * Requires `npm run build` to have been run at least once (it imports dist/).
 */
require('dotenv').config();

const DEFAULT_RECIPIENT = 'temybroder@gmail.com';
const recipient = process.argv[2] || DEFAULT_RECIPIENT;

// ── Preflight: report config before attempting a send ──────────────────
const required = [
  'ZOHO_MAIL_ACCOUNT_ID',
  'ZOHO_MAIL_CLIENT_ID',
  'ZOHO_MAIL_CLIENT_SECRET',
  'ZOHO_MAIL_REFRESH_TOKEN',
];
const missing = required.filter((k) => !process.env[k]);

console.log('Zoho Mail configuration');
console.log('───────────────────────');
for (const key of required) {
  const val = process.env[key];
  // Never print secrets — only whether they are set, and a short fingerprint.
  console.log(
    `  ${key.padEnd(26)} ${val ? `set (${String(val).trim().length} chars)` : 'MISSING'}`,
  );
}
console.log(`  ${'ZOHO_MAIL_REGION'.padEnd(26)} ${process.env['ZOHO_MAIL_REGION'] ?? 'com (default)'}`);
console.log(`  ${'SMTP_FROM'.padEnd(26)} ${process.env['SMTP_FROM'] ?? 'noreply@martinonoir.com (default)'}`);
console.log('');

if (missing.length) {
  console.error(
    `Cannot send: missing ${missing.join(', ')}.\n` +
      'With any of these unset the app runs in stub mode and only logs emails.',
  );
  process.exit(1);
}

// ── Send ───────────────────────────────────────────────────────────────
let EmailService;
try {
  ({ EmailService } = require('../dist/modules/notifications/email.service.js'));
} catch (err) {
  console.error(
    'Could not load dist/modules/notifications/email.service.js — run `npm run build` first.\n' +
      err.message,
  );
  process.exit(1);
}

const sentAt = new Date();
const html = `
  <div style="text-align:center;margin-bottom:24px;">
    <div style="width:56px;height:56px;background:#EEF4FC;border-radius:50%;margin:0 auto 16px;line-height:56px;font-size:28px;">✅</div>
    <h1 style="margin:0;font-size:24px;color:#0a0a0a;">Email configuration test</h1>
  </div>
  <p style="color:#1F2933;font-size:14px;line-height:1.6;">
    If you are reading this, Martino Noir's Zoho Mail integration is working.
    This message was sent by <code>scripts/send-test-email.js</code> through the
    same EmailService the application uses for order confirmations, password
    resets and shipping notifications.
  </p>
  <table style="width:100%;font-size:13px;color:#3E4C59;margin-top:16px;">
    <tr><td style="padding:4px 0;">Sent at</td><td style="text-align:right;">${sentAt.toISOString()}</td></tr>
    <tr><td style="padding:4px 0;">Recipient</td><td style="text-align:right;">${recipient}</td></tr>
    <tr><td style="padding:4px 0;">Region</td><td style="text-align:right;">zoho.${process.env['ZOHO_MAIL_REGION'] ?? 'com'}</td></tr>
  </table>
  <p style="color:#7B8794;font-size:12px;line-height:1.5;margin-top:24px;">
    No action is needed. This is a configuration test, not a customer email.
  </p>`;

(async () => {
  const service = new EmailService();
  console.log(`Sending test email to ${recipient} …`);

  const result = await service.send({
    to: recipient,
    subject: 'Martino Noir — email configuration test',
    html: service.brandedLayout ? service.brandedLayout(html) : html,
  });

  if (result.success) {
    // Stub mode returns success with a dev- prefixed id and sends nothing.
    if (String(result.messageId ?? '').startsWith('dev-')) {
      console.error(
        '\nNOT SENT — EmailService ran in stub mode (credentials not picked up).\n' +
          'The email was only logged. Check that .env is in server/ and readable.',
      );
      process.exit(1);
    }
    console.log(`\nSent. messageId=${result.messageId ?? '(none returned)'}`);
    console.log(`Check ${recipient} (including spam/junk).`);
    return;
  }

  console.error(`\nFAILED: ${result.error}`);
  console.error(
    '\nCommon causes:\n' +
      '  • invalid_code / invalid refresh token → regenerate ZOHO_MAIL_REFRESH_TOKEN\n' +
      '  • Invalid fromAddress → SMTP_FROM must be an address your Zoho account owns\n' +
      '  • wrong ZOHO_MAIL_ACCOUNT_ID → must be the numeric Zoho account id\n' +
      '  • wrong region → set ZOHO_MAIL_REGION (com, eu, in, com.au …)',
  );
  process.exit(1);
})().catch((err) => {
  console.error('\nUnexpected error:', err && err.message ? err.message : err);
  process.exit(1);
});
