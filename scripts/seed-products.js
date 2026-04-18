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

/**
 * Wholesale = 80% of retail price.
 */
function v(sku, name, retailNgn, retailUsd) {
  return {
    sku,
    name,
    retailPriceNgn: retailNgn,
    retailPriceUsd: retailUsd,
    wholesalePriceNgn: Math.round(retailNgn * 0.8),
    wholesalePriceUsd: Math.round(retailUsd * 0.8),
  };
}

async function main() {
  // Register / login admin user
  let token;
  const reg = await post('/auth/register', {
    firstName: 'Admin', lastName: 'Martinonoir',
    email: 'admin@martinonoir.com', password: 'Admin123!@#', countryCode: 'NG',
  });

  if (reg.status === 201 || reg.status === 200) {
    token = reg.data.data.accessToken;
    console.log('Registered admin');
  } else {
    const login = await post('/auth/login', {
      email: 'admin@martinonoir.com', password: 'Admin123!@#',
    });
    if (login.data?.data?.accessToken) {
      token = login.data.data.accessToken;
      console.log('Logged in as admin');
    } else {
      console.error('Auth failed:', JSON.stringify(reg.data), JSON.stringify(login.data));
      return;
    }
  }

  // ── Seed Categories ──
  const categories = [
    {
      name: 'Crossbody Bags',
      alias: 'Sling Bags',
      description: 'Compact crossbody and sling bags for everyday carry. Adjustable straps, hands-free convenience.',
      sortOrder: 1,
    },
    {
      name: 'Backpack Bags',
      alias: 'Laptop Bags',
      description: 'Structured backpacks and laptop bags for work and travel. Padded compartments, ergonomic design.',
      sortOrder: 2,
    },
    {
      name: 'Messenger Bags',
      alias: 'Office Bags',
      description: 'Professional messenger and office bags. Classic silhouettes for the modern workspace.',
      sortOrder: 3,
    },
    {
      name: 'Travel Bags',
      alias: 'Duffel Bags',
      description: 'Spacious travel and duffel bags built for adventure. Durable materials, generous capacity.',
      sortOrder: 4,
    },
  ];

  const categoryIds = {};
  for (const cat of categories) {
    const res = await post('/categories', cat, token);
    if (res.status === 201) {
      categoryIds[cat.name] = res.data.data.id;
      console.log('+ Category:', cat.name, '(alias:', cat.alias + ')');
    } else {
      const msg = res.data?.message || res.status;
      console.log('! Category skipped:', cat.name, '-', msg);
    }
  }

  // ── Seed Products ──
  const products = [
    {
      name: 'Heritage Crossbody',
      description: 'Compact crossbody bag in supple Italian leather with adjustable strap and antique brass hardware. Interior features card slots and a zip pocket.',
      shortDescription: 'Compact crossbody in Italian leather',
      categoryId: categoryIds['Crossbody Bags'],
      isFeatured: true,
      variants: [
        v('HCB-BLK-001', 'Black', 14500000, 9599),
        v('HCB-TAN-001', 'Tan', 14500000, 9599),
      ],
    },
    {
      name: 'Metro Sling',
      description: 'Minimalist sling bag with water-resistant nylon and leather trim. Single-strap design with anti-theft back zip pocket.',
      shortDescription: 'Minimalist sling with anti-theft pocket',
      categoryId: categoryIds['Crossbody Bags'],
      isFeatured: false,
      variants: [
        v('MS-BLK-001', 'Matte Black', 8500000, 5599),
        v('MS-NVY-001', 'Navy', 8500000, 5599),
      ],
    },
    {
      name: 'Atelier Backpack',
      description: 'Structured leather backpack with padded 15" laptop compartment. Magnetic closure, external zip pocket, and adjustable shoulder straps.',
      shortDescription: 'Structured leather backpack with laptop compartment',
      categoryId: categoryIds['Backpack Bags'],
      isFeatured: true,
      variants: [
        v('AB-NVY-001', 'Navy', 19500000, 12900),
        v('AB-BLK-001', 'Black', 19500000, 12900),
      ],
    },
    {
      name: 'Executive Messenger',
      description: 'Classic messenger bag in full-grain leather with a 14" laptop sleeve, magnetic flap closure, and organization pockets.',
      shortDescription: 'Full-grain leather messenger with laptop sleeve',
      categoryId: categoryIds['Messenger Bags'],
      isFeatured: true,
      variants: [
        v('EM-BLK-001', 'Black', 22500000, 14800),
        v('EM-COG-001', 'Cognac', 22500000, 14800),
      ],
    },
    {
      name: 'Office Briefcase',
      description: 'Modern briefcase in pebbled Italian leather. Twin handles, detachable shoulder strap, and structured base for upright storage.',
      shortDescription: 'Modern pebbled leather briefcase',
      categoryId: categoryIds['Messenger Bags'],
      isFeatured: false,
      variants: [
        v('OB-BLK-001', 'Black', 26500000, 17500),
        v('OB-BRN-001', 'Dark Brown', 26500000, 17500),
      ],
    },
    {
      name: 'Voyager Duffel',
      description: 'Spacious weekend duffel in rugged leather with canvas interior. Detachable shoulder strap, shoe compartment, and brass feet.',
      shortDescription: 'Rugged leather weekend duffel',
      categoryId: categoryIds['Travel Bags'],
      isFeatured: true,
      variants: [
        v('VD-BLK-001', 'Black', 32000000, 21000),
        v('VD-TAN-001', 'Tan', 32000000, 21000),
      ],
    },
    {
      name: 'Nomad Travel Tote',
      description: 'Oversized travel tote in coated canvas with leather handles. Interior organizer pockets and trolley sleeve for easy airport travel.',
      shortDescription: 'Oversized canvas travel tote with trolley sleeve',
      categoryId: categoryIds['Travel Bags'],
      isFeatured: false,
      variants: [
        v('NTT-OLV-001', 'Olive', 18500000, 12200),
        v('NTT-BLK-001', 'Black', 18500000, 12200),
      ],
    },
  ];

  for (const p of products) {
    const res = await post('/products', p, token);
    if (res.status === 201) {
      console.log('+ Created:', p.name, '(' + p.variants.length + ' variants)');
    } else {
      const msg = Array.isArray(res.data?.message) ? res.data.message.join(', ') : res.data?.message || res.status;
      console.log('! Skipped:', p.name, '-', msg);
    }
  }

  console.log('\nDone! Seed complete.');
}

main().catch(console.error);
