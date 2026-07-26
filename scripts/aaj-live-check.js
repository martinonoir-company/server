/**
 * aaj-live-check.js
 *
 * Verifies the live AAJ Express API accepts our credentials, using the app's
 * own compiled AajProvider (exact production code path).
 *
 * SAFE BY DEFAULT: runs a QUOTE only, which proves auth + category id +
 * account number without creating a real shipment. Pass --book to also attempt
 * a real create-booking (this books a real draft — use deliberately).
 *
 * Credentials are read from the environment; nothing is written to disk.
 *
 * USAGE (from server/, after `npm run build`):
 *   AAJ_API_KEY=... AAJ_DEFAULT_CATEGORY_ID=... AAJ_ACCOUNT_NUMBER=... \
 *     node scripts/aaj-live-check.js            # quote only (safe)
 *   ...same env... node scripts/aaj-live-check.js --book   # also create-booking
 */
const DO_BOOK = process.argv.includes('--book');

function mask(v) {
  if (!v) return 'MISSING';
  const s = String(v);
  return `set (${s.length} chars, …${s.slice(-4)})`;
}

console.log('AAJ live check');
console.log('──────────────');
console.log('  AAJ_API_KEY             ', mask(process.env.AAJ_API_KEY));
console.log('  AAJ_BASE_URL            ', process.env.AAJ_BASE_URL ?? '(default booking.aajexpress.org/api/v2)');
console.log('  AAJ_DEFAULT_CATEGORY_ID ', process.env.AAJ_DEFAULT_CATEGORY_ID ?? 'MISSING');
console.log('  AAJ_ACCOUNT_NUMBER      ', mask(process.env.AAJ_ACCOUNT_NUMBER));
console.log('  mode                    ', DO_BOOK ? 'QUOTE + CREATE-BOOKING (real draft)' : 'QUOTE only (safe)');
console.log('');

if (!process.env.AAJ_API_KEY) {
  console.error('AAJ_API_KEY not set — cannot run a live check.');
  process.exit(1);
}

let AajProvider;
try {
  ({ AajProvider } = require('../dist/modules/shipping/aaj.provider.js'));
} catch (e) {
  console.error('Could not load dist/…/aaj.provider.js — run `npm run build` first.\n' + e.message);
  process.exit(1);
}

// A representative Lagos → Lagos domestic shipment.
const sender = {
  name: 'Martinonoir',
  phone: process.env.AAJ_SENDER_PHONE || '08038010651',
  email: process.env.AAJ_SENDER_EMAIL || 'mail@martinonoir.com',
  addressLine1: '1 Admiralty Way',
  city: 'Lekki',
  state: 'Lagos',
  country: 'Nigeria',
  countryCode: 'NG',
  stateOrProvinceCode: 'LA',
  postalCode: '101233',
};
const receiver = {
  name: 'Test Receiver',
  phone: '08000000000',
  email: 'test@example.com',
  addressLine1: '12 Test Street',
  city: 'Ikeja',
  state: 'Lagos',
  country: 'Nigeria',
  countryCode: 'NG',
  stateOrProvinceCode: 'LA',
  postalCode: '100001',
};
const items = [{ name: 'Leather bag', quantity: 1, price: 50000 }];

function show(label, res) {
  if (res.ok) {
    console.log(`\n✅ ${label}: OK`);
    console.log(JSON.stringify(res.data, null, 2).slice(0, 1200));
  } else {
    console.log(`\n❌ ${label}: FAILED`);
    console.log('  error     :', res.error);
    if (res.statusCode) console.log('  statusCode:', res.statusCode);
    if (res.raw !== undefined) {
      const raw = typeof res.raw === 'string' ? res.raw : JSON.stringify(res.raw);
      console.log('  raw body  :', String(raw).slice(0, 1500));
    }
  }
  return res.ok;
}

(async () => {
  const aaj = new AajProvider();

  const quote = await aaj.getQuote({
    sender,
    receiver,
    itemsValueNgn: 50000,
    weightKg: 1,
    items,
  });
  const quoteOk = show('QUOTE', quote);

  if (!DO_BOOK) {
    console.log(
      quoteOk
        ? '\nQuote succeeded → auth + category + account are valid. AAJ is accepting our credentials.'
        : '\nQuote failed → see error/raw above. This is the same failure the dispatch flow would hit.',
    );
    return;
  }

  const booking = await aaj.createBooking({
    customBookingId: `LIVECHECK-${process.env.CHECK_ID || 'manual'}`,
    sender,
    receiver,
    itemsValueNgn: 50000,
    weightKg: 1,
    items,
    description: 'Martinonoir live API check',
  });
  show('CREATE-BOOKING', booking);
})().catch((e) => {
  console.error('\nUnexpected error:', e && e.message ? e.message : e);
  process.exit(1);
});
