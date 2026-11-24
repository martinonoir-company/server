/**
 * aaj-booking-check.js
 *
 * Inspect and (optionally) exercise the AAJ create-booking request, using the
 * app's own compiled AajProvider — the exact production payload.
 *
 * MODES:
 *   (default) DRY RUN — builds and PRINTS the create-booking payload the app
 *             would send, plus a preflight of required env/fields. NO HTTP call.
 *             Zero risk.
 *   --book    LIVE — performs ONE real create-booking (a DRAFT booking on your
 *             AAJ account). It does NOT call process-booking, so no parcel
 *             enters AAJ's logistics network. NOTE: create-booking may still
 *             generate a transaction (wallet/credit) per the payload
 *             (payments.transaction.generateTransaction = true). There is no
 *             cancel/void method in our codebase — undo is on AAJ's side.
 *
 * Credentials/config are read from the environment; nothing is written to disk.
 *
 * USAGE (from server/, after `npm run build`):
 *   # Dry run (safe) — inspect the request only:
 *   AAJ_API_KEY=... AAJ_DEFAULT_CATEGORY_ID=... AAJ_ACCOUNT_NUMBER=... \
 *   AAJ_PREDEFINED_DIMENSION_ID=... node scripts/aaj-booking-check.js
 *
 *   # Live — actually create ONE draft booking (deliberate):
 *   ...same env... node scripts/aaj-booking-check.js --book
 */
const DO_BOOK = process.argv.includes('--book');

function mask(v) {
  if (!v) return 'MISSING';
  const s = String(v);
  return `set (${s.length} chars, …${s.slice(-4)})`;
}

console.log('AAJ create-booking check');
console.log('════════════════════════');
console.log('  AAJ_API_KEY                ', mask(process.env.AAJ_API_KEY));
console.log('  AAJ_BASE_URL               ', process.env.AAJ_BASE_URL ?? '(default booking.aajexpress.org/api/v2)');
console.log('  AAJ_DEFAULT_CATEGORY_ID    ', process.env.AAJ_DEFAULT_CATEGORY_ID ?? 'MISSING');
console.log('  AAJ_ACCOUNT_NUMBER         ', mask(process.env.AAJ_ACCOUNT_NUMBER));
console.log('  AAJ_PREDEFINED_DIMENSION_ID', process.env.AAJ_PREDEFINED_DIMENSION_ID ?? 'MISSING');
console.log('  AAJ_PAYMENT_METHOD         ', process.env.AAJ_PAYMENT_METHOD ?? '(default WALLET)');
console.log('  mode                       ', DO_BOOK ? 'LIVE create-booking (real DRAFT)' : 'DRY RUN (print payload only, no HTTP)');
console.log('');

// Preflight: surface likely-400 causes before we even look at the payload.
const problems = [];
if (!process.env.AAJ_API_KEY) problems.push('AAJ_API_KEY missing → provider runs in STUB mode (no real call).');
if (!process.env.AAJ_DEFAULT_CATEGORY_ID) problems.push('AAJ_DEFAULT_CATEGORY_ID missing → DOMESTIC bookings are rejected by our own guard.');
if (!process.env.AAJ_ACCOUNT_NUMBER) problems.push('AAJ_ACCOUNT_NUMBER missing → payments.accountNumber omitted; AAJ may reject.');
if (!process.env.AAJ_PREDEFINED_DIMENSION_ID) problems.push('AAJ_PREDEFINED_DIMENSION_ID missing → package has no dimensions; AAJ returns 500 on booking.');
if (problems.length) {
  console.log('Preflight warnings:');
  for (const p of problems) console.log('  • ' + p);
  console.log('');
}

// Representative Lagos → Lagos domestic shipment (matches aaj-live-check.js).
const sender = {
  name: process.env.AAJ_SENDER_NAME || 'Martinonoir',
  phone: process.env.AAJ_SENDER_PHONE || '08038010651',
  email: process.env.AAJ_SENDER_EMAIL || 'mail@martinonoir.com',
  company: 'Martinonoir',
  addressLine1: process.env.AAJ_SENDER_LINE1 || '1 Admiralty Way',
  city: process.env.AAJ_SENDER_CITY || 'Lekki',
  state: 'Lagos',
  country: 'Nigeria',
  countryCode: 'NG',
  stateOrProvinceCode: 'LA',
  postalCode: process.env.AAJ_SENDER_POSTAL || '101233',
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

// A clearly-marked, unique test id so the draft is identifiable on AAJ's side.
const customBookingId =
  process.env.CHECK_ID || `TESTBOOKING-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}`;

function show(label, res) {
  if (res.ok) {
    console.log(`\n✅ ${label}: OK`);
    console.log(JSON.stringify(res.data, null, 2).slice(0, 1600));
  } else {
    console.log(`\n❌ ${label}: FAILED`);
    console.log('  error     :', res.error);
    if (res.statusCode) console.log('  statusCode:', res.statusCode);
    if (res.raw !== undefined) {
      const raw = typeof res.raw === 'string' ? res.raw : JSON.stringify(res.raw);
      console.log('  raw body  :', String(raw).slice(0, 1800));
    }
  }
  return res.ok;
}

(async () => {
  if (!DO_BOOK) {
    // DRY RUN: reconstruct the exact body createBooking() builds, without
    // sending it. This mirrors aaj.provider.ts createBooking() 1:1 so we can
    // eyeball structure, required fields, and the money-bearing bits.
    const categoryId = process.env.AAJ_DEFAULT_CATEGORY_ID || '<AAJ_DEFAULT_CATEGORY_ID>';
    const accountNumber = process.env.AAJ_ACCOUNT_NUMBER || '<AAJ_ACCOUNT_NUMBER>';
    const dim = process.env.AAJ_PREDEFINED_DIMENSION_ID || '<AAJ_PREDEFINED_DIMENSION_ID>';
    const method = process.env.AAJ_PAYMENT_METHOD || 'WALLET';
    const body = {
      customBookingId,
      sender: {
        contact: { name: sender.name, phone: '+2348038010651', email: sender.email, company: sender.company },
        addressDetails: {
          addressLine1: sender.addressLine1, city: sender.city, state: sender.state,
          country: sender.country, countryCode: 'NG', stateOrProvinceCode: 'LA', postalCode: sender.postalCode,
        },
      },
      receiver: {
        contact: { name: receiver.name, phone: '+2348000000000', email: receiver.email },
        addressDetails: {
          addressLine1: receiver.addressLine1, city: receiver.city, state: receiver.state,
          country: receiver.country, countryCode: 'NG', stateOrProvinceCode: 'LA', postalCode: receiver.postalCode,
        },
      },
      packageInsurance: 'FR',
      packages: {
        packageType: 'regular',
        itemsValue: 50000,
        packages: [
          {
            unitMeasurement: 'KGS',
            actualWeight: 1,
            predefinedDimension: dim,
            items: items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, unitMeasurement: 'KGS', excludePackingList: false })),
          },
        ],
        addOns: [],
        createMultiple: false,
      },
      payments: { accountNumber, transaction: { generateTransaction: true, method } },
      carrier: 'AAJ',
      serviceType: 'DOMESTIC',
      deliveryMode: 'DOOR_STEP',
      description: 'Martinonoir order',
      category: categoryId,
      getAcknowledgementCopy: false,
    };
    console.log('DRY RUN — this is the exact create-booking payload the app sends:');
    console.log('(no HTTP request was made)\n');
    console.log(JSON.stringify(body, null, 2));
    console.log('\nNote the money-bearing field: payments.transaction.generateTransaction = true (' + method + ').');
    console.log('Re-run with --book to actually create ONE draft booking.');
    return;
  }

  // LIVE path.
  if (!process.env.AAJ_API_KEY) {
    console.error('Refusing --book without AAJ_API_KEY (would be a stub, proving nothing).');
    process.exit(1);
  }
  let AajProvider;
  try {
    ({ AajProvider } = require('../dist/modules/shipping/aaj.provider.js'));
  } catch (e) {
    console.error('Could not load dist/…/aaj.provider.js — run `npm run build` first.\n' + e.message);
    process.exit(1);
  }
  const aaj = new AajProvider();
  console.log(`Creating ONE real draft booking  customBookingId=${customBookingId}`);
  const booking = await aaj.createBooking({
    customBookingId,
    sender,
    receiver,
    itemsValueNgn: 50000,
    weightKg: 1,
    items,
    description: 'Martinonoir create-booking API check',
  });
  const ok = show('CREATE-BOOKING', booking);
  console.log(
    ok
      ? '\nBooking created. It is a DRAFT (process-booking was NOT called, so no parcel is in the network). ' +
          'Review/void it on the AAJ dashboard if needed.'
      : '\nCreate-booking failed — the error/raw above is the same failure the dispatch flow would hit.',
  );
})().catch((e) => {
  console.error('\nUnexpected error:', e && e.message ? e.message : e);
  process.exit(1);
});
