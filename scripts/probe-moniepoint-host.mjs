// We now have a Monnify-issued JWT with aud=moniepoint-pos-backend-service.
// Try it against every plausible POS API host with introspect + a no-op
// push. Whichever host returns 200 on introspect is the right one.

const CLIENT_ID =
  process.env.MONIEPOINT_CLIENT_ID ||
  'api-client-23941-d7e76572-3cdd-44b4-aac9-542bd10c9b18';
const CLIENT_SECRET =
  process.env.MONIEPOINT_CLIENT_SECRET || 'gQpeuXwQS_O+46%Ke+C3';

const hosts = [
  'https://api.pos.moniepoint.com',
  'https://channel.moniepoint.com',
  'https://api.channel.moniepoint.com',
  'https://pos.moniepoint.com',
  'https://api.moniepoint.com',
  'https://erp.moniepoint.com',
  'https://erp.api.moniepoint.com',
];

async function getToken() {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://api.monnify.com/api/v1/auth/login', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}` },
  });
  const j = await res.json();
  return j.responseBody.accessToken;
}

(async () => {
  const tok = await getToken();
  console.log(`Got token (len ${tok.length})\n`);
  for (const host of hosts) {
    process.stdout.write(`${host}\n`);
    try {
      const r1 = await fetch(`${host}/v1/introspect`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const t1 = await r1.text();
      console.log(`  introspect → ${r1.status} ${t1.slice(0, 200)}`);
    } catch (e) {
      console.log(`  introspect → ${e.code || e.name}`);
    }
    console.log();
  }
})();
