/**
 * zoho-mail-authorize.js
 *
 * Zero-copy-paste companion to zoho-mail-bootstrap.js: starts a local HTTP
 * listener, waits for Zoho's OAuth redirect after the user approves consent
 * in the browser, then hands the grant code to zoho-mail-bootstrap.js which
 * writes ZOHO_MAIL_ACCOUNT_ID + ZOHO_MAIL_REFRESH_TOKEN into .env.
 *
 * USAGE (from server/):  node scripts/zoho-mail-authorize.js
 * Then open the printed URL (or let the caller open it) and sign in.
 * Times out after 10 minutes.
 */
require('dotenv').config();
const http = require('http');
const { spawnSync } = require('child_process');

const PORT = Number(process.env['ZOHO_OAUTH_PORT'] ?? 8399);
const CALLBACK_PATH = process.env['ZOHO_OAUTH_CALLBACK_PATH'] ?? '/zoho/callback';
const REDIRECT_URI = `http://localhost:${PORT}${CALLBACK_PATH}`;
const region = process.env['ZOHO_MAIL_REGION'] ?? 'com';
const clientId = process.env['ZOHO_MAIL_CLIENT_ID'];

if (!clientId) {
  console.error('ZOHO_MAIL_CLIENT_ID missing from .env');
  process.exit(1);
}

const authUrl =
  `https://accounts.zoho.${region}/oauth/v2/auth` +
  `?response_type=code` +
  `&client_id=${encodeURIComponent(clientId)}` +
  `&scope=${encodeURIComponent('ZohoMail.messages.CREATE,ZohoMail.accounts.READ')}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&access_type=offline&prompt=consent`;

console.log('Authorization URL:\n' + authUrl + '\n');
console.log(`Listening on ${REDIRECT_URI} — complete the sign-in in your browser...`);

const timeout = setTimeout(() => {
  console.error('Timed out after 10 minutes without receiving a callback.');
  server.close();
  process.exit(1);
}, 10 * 60 * 1000);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== CALLBACK_PATH) {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const html = (msg) =>
    `<html><body style="font-family:sans-serif;padding:40px;"><h2>${msg}</h2>` +
    `<p>You can close this tab and return to the terminal.</p></body></html>`;

  if (error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(html(`Authorization failed: ${error ?? 'no code returned'}`));
    console.error(`Callback returned error: ${error ?? 'no code'}`);
    clearTimeout(timeout);
    server.close();
    process.exit(1);
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html('Authorization received — finishing setup...'));
  console.log('Grant code received; exchanging for tokens...');
  clearTimeout(timeout);
  server.close();

  const result = spawnSync(
    process.execPath,
    [require('path').join(__dirname, 'zoho-mail-bootstrap.js'), code, '--redirect-uri', REDIRECT_URI],
    { stdio: 'inherit' },
  );
  process.exit(result.status ?? 1);
});

server.listen(PORT, '127.0.0.1');
