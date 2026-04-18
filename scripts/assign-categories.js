const http = require('http');

function request(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : '';
    const headers = { 'Content-Type': 'application/json' };
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(
      { hostname: 'localhost', port: 3001, path: '/api/v1' + path, method, headers },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
          catch { resolve({ status: res.statusCode, data: d }); }
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  // Login
  const login = await request('POST', '/auth/login', {
    email: 'admin@martinonoir.com', password: 'Admin123!@#',
  });
  const token = login.data?.data?.accessToken;
  if (!token) { console.error('Auth failed'); return; }

  // Get categories
  const catRes = await request('GET', '/categories', null, token);
  const categories = catRes.data?.data || [];
  const catMap = {};
  for (const c of categories) catMap[c.slug] = c.id;
  console.log('Categories:', Object.keys(catMap).join(', '));

  // Get products
  const prodRes = await request('GET', '/products?limit=50', null, token);
  const products = prodRes.data?.data?.items || [];

  // Category assignments
  const assignments = {
    'milano-leather-tote': 'bags',
    'heritage-crossbody': 'bags',
    'atelier-backpack': 'bags',
    'noir-blazer': 'clothing',
    'cashmere-scarf': 'clothing',
    'executive-wallet': 'accessories',
    'signature-belt': 'accessories',
    'silk-pocket-square': 'accessories',
  };

  for (const product of products) {
    const targetCat = assignments[product.slug];
    if (targetCat && catMap[targetCat]) {
      const res = await request('PUT', `/products/${product.id}`, {
        categoryId: catMap[targetCat],
      }, token);
      if (res.status === 200) {
        console.log(`+ ${product.name} → ${targetCat}`);
      } else {
        console.log(`! ${product.name}: ${res.data?.message || res.status}`);
      }
    } else {
      console.log(`? ${product.name}: no category mapping for "${product.slug}"`);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
