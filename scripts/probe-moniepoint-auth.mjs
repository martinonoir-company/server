// Probe candidate Moniepoint OAuth token endpoints with client-credentials.
// Whichever one returns a JWT, we then call /v1/introspect on the POS API
// with that JWT to confirm the token is accepted there.
//
// Run: node scripts/probe-moniepoint-auth.mjs
//
// Env (already set in server/.env, but pass explicitly to be safe):
//   MONIEPOINT_CLIENT_ID
//   MONIEPOINT_CLIENT_SECRET

const CLIENT_ID =
  process.env.MONIEPOINT_CLIENT_ID ||
  'api-client-23941-d7e76572-3cdd-44b4-aac9-542bd10c9b18';
const CLIENT_SECRET =
  process.env.MONIEPOINT_CLIENT_SECRET || 'gQpeuXwQS_O+46%Ke+C3';
const POS_API = 'https://api.pos.moniepoint.com';

const candidates = [
  // Most likely first — Moniepoint identity/auth domains
  'https://identity.moniepoint.com/oauth/token',
  'https://auth.moniepoint.com/oauth/token',
  'https://auth.pos.moniepoint.com/oauth/token',
  'https://identity.pos.moniepoint.com/oauth/token',
  // Sandbox parallels
  'https://identity.sandbox.moniepoint.com/oauth/token',
  // TeamApt origin (Moniepoint was TeamApt) — sometimes still hosts auth
  'https://identity.teamapt.com/oauth/token',
  'https://auth.teamapt.com/oauth/token',
  // Path variants on the POS host itself, in case introspect-only host
  'https://api.pos.moniepoint.com/oauth/token',
  'https://api.pos.moniepoint.com/v1/oauth/token',
  'https://api.pos.moniepoint.com/v1/auth/token',
  'https://api.pos.moniepoint.com/v1/auth',
  // Monnify (different product, same parent) — for elimination
  'https://api.monnify.com/api/v1/auth/login',
];

const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

/** Try a single token URL with two body shapes (form + JSON, Basic + body). */
async function probe(url) {
  const attempts = [
    {
      label: 'Basic auth + form body',
      init: {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      },
    },
    {
      label: 'Form body w/ client_id+client_secret',
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }).toString(),
      },
    },
    {
      label: 'JSON body w/ clientId+clientSecret',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }),
      },
    },
  ];

  for (const a of attempts) {
    let status, text;
    try {
      const res = await fetch(url, a.init);
      status = res.status;
      text = await res.text();
    } catch (err) {
      console.log(`  ✗ ${a.label}: ${err.code || err.name} — ${err.message}`);
      continue;
    }
    const snip = text.length > 240 ? text.slice(0, 240) + '…' : text;
    console.log(`  ${status === 200 ? '✓' : '·'} ${a.label}: ${status} ${snip}`);
    if (status === 200) {
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = null; }
      const tok =
        parsed?.accessToken ??
        parsed?.access_token ??
        parsed?.responseBody?.accessToken;
      if (tok) {
        console.log(`     → got token (len ${tok.length}, prefix ${tok.slice(0, 30)}…)`);
        return tok;
      }
    }
  }
  return null;
}

async function introspect(token) {
  const res = await fetch(`${POS_API}/v1/introspect`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.text();
  console.log(`  introspect → ${res.status} ${body.slice(0, 200)}`);
  return res.ok;
}

(async () => {
  console.log(`Client ID: ${CLIENT_ID}`);
  console.log(`Client Secret (len): ${CLIENT_SECRET.length}\n`);

  for (const url of candidates) {
    console.log(`== ${url} ==`);
    const tok = await probe(url);
    if (tok) {
      console.log(`\nValidating against ${POS_API}/v1/introspect …`);
      const ok = await introspect(tok);
      if (ok) {
        console.log(`\n✅ WORKS: ${url}`);
        return;
      } else {
        console.log(`(token granted but POS API rejected it — wrong issuer)`);
      }
    }
    console.log();
  }
  console.log('No candidate produced a token accepted by the POS API.');
})();
