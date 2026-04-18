const http = require('http');

function post(path, data, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(
      { hostname: 'localhost', port: 3001, path: '/api/v1' + path, method: 'POST', headers },
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
    req.write(body);
    req.end();
  });
}

async function main() {
  // Login as admin
  const login = await post('/auth/login', {
    email: 'admin@martinonoir.com', password: 'Admin123!@#',
  });
  const token = login.data?.data?.accessToken;
  if (!token) { console.error('Auth failed'); return; }
  console.log('Authenticated');

  const categories = [
    {
      name: 'Bags',
      description: 'Premium leather bags — totes, crossbodies, clutches, and backpacks crafted from the finest Italian leather.',
      imageUrl: '/images/category-bags.jpg',
      sortOrder: 1,
    },
    {
      name: 'Clothing',
      description: 'Tailored clothing for the modern professional — blazers, shirts, and outerwear in premium fabrics.',
      imageUrl: '/images/category-clothing.jpg',
      sortOrder: 2,
    },
    {
      name: 'Accessories',
      description: 'Finishing touches — wallets, belts, pocket squares, scarves, and more.',
      imageUrl: '/images/category-accessories.jpg',
      sortOrder: 3,
    },
  ];

  for (const c of categories) {
    const res = await post('/categories', c, token);
    if (res.status === 201) {
      console.log('+ Created:', c.name, '(id:', res.data.data.id + ')');
    } else {
      const msg = res.data?.message || res.status;
      console.log('! Skipped:', c.name, '-', msg);
    }
  }

  console.log('\nDone! Categories seeded.');
}

main().catch(console.error);
