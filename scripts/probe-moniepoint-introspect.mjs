// Quick sanity check: hit /v1/introspect with the raw API Key as the
// bearer. If 200, we know the dashboard "API Key" IS the bearer and
// there is no token exchange to do.
const KEY = process.env.MONIEPOINT_API_KEY ?? 'gQpeuXwQS_O+46%Ke+C3';
const HOST = 'https://api.pos.moniepoint.com';

const res = await fetch(`${HOST}/v1/introspect`, {
  headers: { Authorization: `Bearer ${KEY}` },
});
console.log(`Status: ${res.status}`);
console.log(await res.text());
