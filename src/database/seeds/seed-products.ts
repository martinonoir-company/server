import 'reflect-metadata';
import AppDataSource from '../data-source';
import { Product, ProductVariant } from '../../modules/products/entities/product.entity';
import { StockLevel, StockMovement, MovementKind } from '../../modules/inventory/entities/inventory.entity';

/**
 * Seeds 2 test products with variants and stock levels for POS testing.
 * Idempotent — skips if products already exist.
 */
async function seedProducts() {
  await AppDataSource.initialize();
  console.log('  ✓ Database connected');

  const productRepo = AppDataSource.getRepository(Product);
  const variantRepo = AppDataSource.getRepository(ProductVariant);
  const stockRepo = AppDataSource.getRepository(StockLevel);
  const movementRepo = AppDataSource.getRepository(StockMovement);

  const products = [
    {
      name: 'Martinonoir Classic Leather Bag',
      slug: 'martinonoir-classic-leather-bag',
      description: 'Premium handcrafted leather bag with gold-tone hardware. A signature Martinonoir piece.',
      shortDescription: 'Classic leather bag with gold hardware',
      isActive: true,
      isFeatured: true,
      tags: ['leather', 'bag', 'classic', 'premium'],
      variants: [
        {
          sku: 'MN-CLB-BLK',
          name: 'Black',
          retailPriceNgn: 85000,
          retailPriceUsd: 5500,
          wholesalePriceNgn: 65000,
          wholesalePriceUsd: 4200,
          costPriceNgn: 35000,
          barcode: '6001234560011',
          options: { color: 'Black' },
          trackInventory: true,
          stock: 52,
        },
        {
          sku: 'MN-CLB-BRN',
          name: 'Brown',
          retailPriceNgn: 85000,
          retailPriceUsd: 5500,
          wholesalePriceNgn: 65000,
          wholesalePriceUsd: 4200,
          costPriceNgn: 35000,
          barcode: '6001234560028',
          options: { color: 'Brown' },
          trackInventory: true,
          stock: 40,
        },
      ],
    },
    {
      name: 'Martinonoir Signature Perfume',
      slug: 'martinonoir-signature-perfume',
      description: 'A bold, unisex fragrance with notes of oud, sandalwood, and bergamot. 100ml.',
      shortDescription: 'Signature unisex fragrance 100ml',
      isActive: true,
      isFeatured: true,
      tags: ['perfume', 'fragrance', 'unisex', 'premium'],
      variants: [
        {
          sku: 'MN-SPF-100',
          name: '100ml',
          retailPriceNgn: 45000,
          retailPriceUsd: 2900,
          wholesalePriceNgn: 32000,
          wholesalePriceUsd: 2100,
          costPriceNgn: 15000,
          barcode: '6001234560035',
          options: { size: '100ml' },
          trackInventory: true,
          stock: 66,
        },
        {
          sku: 'MN-SPF-50',
          name: '50ml',
          retailPriceNgn: 28000,
          retailPriceUsd: 1800,
          wholesalePriceNgn: 20000,
          wholesalePriceUsd: 1300,
          costPriceNgn: 9000,
          barcode: '6001234560042',
          options: { size: '50ml' },
          trackInventory: true,
          stock: 45,
        },
      ],
    },
  ];

  for (const pDef of products) {
    // Check if product already exists
    const existing = await productRepo.findOne({ where: { slug: pDef.slug } });
    if (existing) {
      console.log(`  ✓ Product already exists: ${pDef.name}`);
      continue;
    }

    // Create product
    const product = productRepo.create({
      name: pDef.name,
      slug: pDef.slug,
      description: pDef.description,
      shortDescription: pDef.shortDescription,
      isActive: pDef.isActive,
      isFeatured: pDef.isFeatured,
      tags: pDef.tags,
    });
    await productRepo.save(product);
    console.log(`  + Created product: ${pDef.name} (${product.id})`);

    // Create variants + stock
    for (const vDef of pDef.variants) {
      const variant = variantRepo.create({
        productId: product.id,
        sku: vDef.sku,
        name: vDef.name,
        retailPriceNgn: vDef.retailPriceNgn,
        retailPriceUsd: vDef.retailPriceUsd,
        wholesalePriceNgn: vDef.wholesalePriceNgn,
        wholesalePriceUsd: vDef.wholesalePriceUsd,
        costPriceNgn: vDef.costPriceNgn,
        barcode: vDef.barcode,
        options: vDef.options,
        trackInventory: vDef.trackInventory,
        isActive: true,
      });
      await variantRepo.save(variant);
      console.log(`    + Variant: ${vDef.name} (${variant.id}) SKU=${vDef.sku}`);

      // Create stock level
      const stockLevel = stockRepo.create({
        variantId: variant.id,
        warehouseCode: 'DEFAULT',
        onHand: vDef.stock,
        reserved: 0,
        lastMovementAt: new Date(),
      });
      await stockRepo.save(stockLevel);

      // Create initial RECEIPT movement
      const movement = movementRepo.create({
        variantId: variant.id,
        kind: MovementKind.RECEIPT,
        quantity: vDef.stock,
        warehouseCode: 'DEFAULT',
        referenceId: `SEED-${vDef.sku}`,
        referenceType: 'SEED',
        reason: 'Initial stock seed for POS testing',
        createdBy: 'SYSTEM',
      });
      await movementRepo.save(movement);
      console.log(`    + Stock: ${vDef.stock} units on hand`);
    }
  }

  await AppDataSource.destroy();
  console.log('  ✓ Done');
}

seedProducts().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
