import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function compile(path, requireMap = {}) {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8')).replace("import 'server-only';", '');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'exports', 'module', code)((name) => {
    if (name in requireMap) return requireMap[name];
    if (path.endsWith('/pricing.ts')) return {};
    throw new Error(`Unexpected import: ${name}`);
  }, module.exports, module);
  return module.exports;
}

const pricing = await compile('../src/lib/pricing.ts');
const quotesPage = await readFile(new URL('../src/app/(dashboard)/quotes/page.tsx', import.meta.url), 'utf8');
const storeModal = await readFile(new URL('../src/components/store/ProductConfiguratorModal.tsx', import.meta.url), 'utf8');
const sizeGridRegression = await readFile(new URL('./whatsapp-customer-product-resolver.test.mjs', import.meta.url), 'utf8');

const contract = await compile('../src/lib/whatsapp/variable-contract.ts');
const engine = await compile('../src/lib/whatsapp/template-engine.ts', { './variable-contract': contract });
const richText = await import('../src/lib/rich-text-editor-core.mjs');
const customerProductResolver = await compile('../src/lib/whatsapp/customer-product-variable-resolver.server.ts', {
  './variable-contract': contract,
  './template-engine': engine,
  '@/lib/pricing': pricing,
  '@/lib/utils': { richTextToPlainText: richText.richTextToPlainText },
  '@/lib/supabase/server-admin': { getSupabaseAdminClient: () => { throw new Error('not used'); } }
});

const product = {
  id: 'taloes',
  pricing_type: 'unidade',
  sales_price: 166.67,
  pricing_details: {
    configurator_options: {
      sale_mode: 'volume',
      variant_pricing_matrix: [
        {
          id: 'row-a', material: 'Sulfit 75g', size: '20x30cm', colors: '4x4', finishing: 'REFILE', active: true,
          tiers: [
            { quantity: 1, unit_price: 35, total_price: 35 },
            { quantity: 5, unit_price: 32, total_price: 160 }
          ]
        },
        {
          id: 'row-b', material: 'Sulfit 75g', size: '15x20cm', colors: '4x0', finishing: 'Refile', active: true,
          tiers: [
            { quantity: 10, unit_price: 22, total_price: 220 },
            { quantity: 20, unit_price: 20, total_price: 400 }
          ]
        },
        {
          id: 'row-empty', material: 'Sulfit 75g', size: '30x40cm', colors: '1x0', finishing: 'Sem acabamento', active: true,
          tiers: []
        }
      ]
    }
  }
};

const rows = pricing.getNormalizedVariantPricingMatrix(product);
const selectionA = { material: 'Sulfit 75g', size: '20x30cm', colors: '4x4', finishing: 'REFILE' };
const selectionB = { material: 'Sulfit 75g', size: '15x20cm', colors: '4x0', finishing: 'Refile' };

test('complete quote combination exposes only its official tiers', () => {
  assert.deepEqual(pricing.getVariantPricingTiersForSelection(rows, selectionA).map((tier) => tier.min_qty), [1, 5]);
});

test('incomplete quote combination exposes no tier', () => {
  assert.deepEqual(pricing.getVariantPricingTiersForSelection(rows, { material: 'Sulfit 75g', size: '20x30cm' }), []);
  assert.deepEqual(pricing.getMissingVariantPricingSelectionFields(rows, { material: 'Sulfit 75g', size: '20x30cm' }), ['colors', 'finishing']);
});

test('combination A never exposes tiers from combination B', () => {
  assert.deepEqual(pricing.getVariantPricingTiersForSelection(rows, selectionA).map((tier) => tier.total), [35, 160]);
});

test('changing combination resets downstream selections before exposing B', () => {
  const afterSizeChange = pricing.updateVariantPricingSelection(selectionA, 'size', '15x20cm');
  assert.deepEqual(afterSizeChange, { material: 'Sulfit 75g', size: '15x20cm', colors: '', finishing: '' });
  assert.deepEqual(pricing.getVariantPricingTiersForSelection(rows, afterSizeChange), []);

  const afterColorChange = pricing.updateVariantPricingSelection(afterSizeChange, 'colors', '4x0');
  const completedB = pricing.updateVariantPricingSelection(afterColorChange, 'finishing', 'Refile');
  assert.deepEqual(pricing.getVariantPricingTiersForSelection(rows, completedB).map((tier) => tier.min_qty), [10, 20]);
});

test('selected tier keeps the official quantity', () => {
  const tier = pricing.getVariantPricingTiersForSelection(rows, selectionB).find((candidate) => candidate.min_qty === 20);
  assert.equal(tier?.min_qty, 20);
});

test('selected tier keeps the official price', () => {
  const tier = pricing.getVariantPricingTiersForSelection(rows, selectionB).find((candidate) => candidate.min_qty === 20);
  assert.equal(tier?.price, 20);
  assert.equal(tier?.total, 400);
});

test('quantity and price are resolved from the same matrix row', () => {
  const row = pricing.findVariantPricingMatrixRow(rows, selectionB);
  const tier = pricing.getVariantPricingTiersForSelection(rows, selectionB).find((candidate) => candidate.min_qty === 10);
  assert.equal(row?.id, 'row-b');
  assert.equal(tier, row?.tiers[0]);
});

test('valid combination without tiers stays explicit and never falls back to base price', () => {
  const emptySelection = { material: 'Sulfit 75g', size: '30x40cm', colors: '1x0', finishing: 'Sem acabamento' };
  assert.equal(pricing.findVariantPricingMatrixRow(rows, emptySelection)?.id, 'row-empty');
  assert.deepEqual(pricing.getVariantPricingTiersForSelection(rows, emptySelection), []);
  assert.match(quotesPage, /Nenhuma tiragem\/preço cadastrado para esta combinação\./);
  assert.doesNotMatch(quotesPage, /Preço base: \{formatUnitCurrency/);
});

test('simple unit pricing remains on the official resolver', () => {
  const result = pricing.resolveProductPrice({ pricing_type: 'unidade', sales_price: 12, pricing_details: {} }, { quantity: 3 });
  assert.equal(result.pricingMode, 'simple');
  assert.equal(result.totalPrice, 36);
  assert.equal(result.unitPrice, 12);
});

test('size_grid regression coverage remains active', () => {
  assert.match(sizeGridRegression, /size_grid rehydrates the single official size server-side/);
  assert.match(sizeGridRegression, /size_grid fails closed for missing, invalid, ambiguous or malformed official size selections/);
});

test('quote and Store reuse the official cascading selection helper', () => {
  assert.match(quotesPage, /updateVariantPricingSelection\(matrixSelection, field, value\)/);
  assert.match(storeModal, /updateVariantPricingSelection\(matrixSelection, field, value\)/);
  assert.doesNotMatch(quotesPage, /\|\| selectedVariantPricingRows\[0\] \|\| null/);
});

const exactAdversarialRow = {
  id: 'exact-priced',
  material: 'Sulfit 75g',
  size: '20x30cm',
  colors: '4x4',
  finishing: 'REFILE',
  active: true,
  tiers: [{ quantity: 10, unit_price: 25, total_price: 250 }]
};

const emptyTierAdversarialRow = {
  ...exactAdversarialRow,
  id: 'exact-empty',
  tiers: []
};

const malformedLegacyRow = {
  ...exactAdversarialRow,
  id: 'legacy-missing-colors',
  colors: '',
  tiers: [{ quantity: 1, unit_price: 999, total_price: 999 }]
};

const adversarialSelection = {
  material: 'Sulfit 75g',
  size: '20x30cm',
  colors: '4x4',
  finishing: 'REFILE'
};

function matrixFixture(matrix, volumePricing = []) {
  return {
    pricing_type: 'unidade',
    sales_price: 166.67,
    volume_pricing: volumePricing,
    pricing_details: {
      configurator_options: {
        sale_mode: 'volume',
        variant_pricing_matrix: matrix
      }
    }
  };
}

test('empty-tier row before a valid row cannot shadow the official matrix tiers', () => {
  const summary = pricing.getProductQuantityTierSummary(matrixFixture([
    emptyTierAdversarialRow,
    exactAdversarialRow
  ], [{ min_qty: 100, price: 1 }]));

  assert.equal(summary.source, 'variant_pricing_matrix');
  assert.equal(summary.matrixRow?.id, 'exact-priced');
  assert.deepEqual(summary.tiers.map((tier) => [tier.min_qty, tier.price, tier.total]), [[10, 25, 250]]);
});

test('empty-tier row after a valid row produces the same official result', () => {
  const summary = pricing.getProductQuantityTierSummary(matrixFixture([
    exactAdversarialRow,
    emptyTierAdversarialRow
  ], [{ min_qty: 100, price: 1 }]));

  assert.equal(summary.source, 'variant_pricing_matrix');
  assert.equal(summary.matrixRow?.id, 'exact-priced');
  assert.deepEqual(summary.tiers.map((tier) => [tier.min_qty, tier.price, tier.total]), [[10, 25, 250]]);
});

test('legacy row missing a required dimension before the exact row never matches', () => {
  const rows = pricing.getNormalizedVariantPricingMatrix(matrixFixture([
    malformedLegacyRow,
    exactAdversarialRow
  ]));

  assert.equal(pricing.findVariantPricingMatrixRow(rows, adversarialSelection)?.id, 'exact-priced');
  assert.deepEqual(pricing.getVariantPricingTiersForSelection(rows, adversarialSelection).map((tier) => tier.price), [25]);
});

test('legacy row missing a required dimension after the exact row produces the same result', () => {
  const rows = pricing.getNormalizedVariantPricingMatrix(matrixFixture([
    exactAdversarialRow,
    malformedLegacyRow
  ]));

  assert.equal(pricing.findVariantPricingMatrixRow(rows, adversarialSelection)?.id, 'exact-priced');
  assert.deepEqual(pricing.getVariantPricingTiersForSelection(rows, adversarialSelection).map((tier) => tier.price), [25]);
});

test('a lone malformed legacy row fails closed for a complete selection', () => {
  for (const field of ['material', 'size', 'colors', 'finishing']) {
    for (const missingValue of ['', null, undefined]) {
      const rows = pricing.getNormalizedVariantPricingMatrix(matrixFixture([{
        ...exactAdversarialRow,
        id: `legacy-missing-${field}`,
        [field]: missingValue
      }]));

      assert.equal(pricing.findVariantPricingMatrixRow(rows, adversarialSelection), null);
      assert.deepEqual(pricing.getVariantPricingTiersForSelection(rows, adversarialSelection), []);
    }
  }
});

test('legitimate volume pricing remains on the official volume path', () => {
  const result = pricing.resolveProductPrice({
    pricing_type: 'unidade',
    sales_price: 12,
    volume_pricing: [{ min_qty: 1, price: 9 }, { min_qty: 10, price: 7 }],
    pricing_details: {}
  }, { quantity: 10 });

  assert.equal(result.pricingMode, 'volume');
  assert.equal(result.unitPrice, 7);
  assert.equal(result.totalPrice, 70);
});

test('an empty matrix row cannot divert a later valid matrix row to volume pricing', () => {
  const summary = pricing.getProductQuantityTierSummary(matrixFixture([
    emptyTierAdversarialRow,
    exactAdversarialRow
  ], [{ min_qty: 10, price: 1 }]));

  assert.equal(summary.source, 'variant_pricing_matrix');
  assert.equal(summary.matrixRow?.id, 'exact-priced');
  assert.equal(summary.tiers[0]?.total, 250);
});

test('size_grid resolves the official server-side size price behaviorally', async () => {
  const sizeGridProduct = {
    id: 'product-size-grid',
    company_id: 'company-a',
    category_id: 'category-a',
    name: 'Produto grade',
    description: 'Produto com grade oficial',
    pricing_type: 'unidade',
    sales_price: 10,
    active: true,
    catalog_active: true,
    image_url: null,
    volume_pricing: [],
    pricing_details: {
      configurator_options: {
        sale_mode: 'size_grid',
        size_options: [
          { name: 'A4', price_delta: 30, additional_days: 1, is_default: true },
          { name: 'A3', price_delta: 50, additional_days: 2, is_default: false }
        ]
      }
    }
  };
  const publicContext = customerProductResolver.createStoreProductPricingContext({
    quantity: 2,
    selectedOptions: [{ name: 'A4', group_name: 'Tamanho', price_delta: 999999 }]
  });
  const result = await customerProductResolver.resolveWhatsAppProductVariables({
    trustedCompanyId: 'company-a',
    productId: 'product-size-grid',
    eventKey: 'store_product_request',
    requireCatalogAvailability: true,
    existingProduct: sizeGridProduct,
    existingCategory: { id: 'category-a', company_id: 'company-a', name: 'Categoria' },
    ...publicContext
  }, {
    async getCustomer() { return null; },
    async getProduct() { return null; },
    async getCategory() { return null; }
  });

  assert.equal(result.variables['produto.preco'], pricing.formatCurrency(30));
  assert.doesNotMatch(JSON.stringify(result), /999999/);
});

test('globally optional matrix dimensions remain optional', () => {
  const rows = pricing.getNormalizedVariantPricingMatrix(matrixFixture([{
    ...exactAdversarialRow,
    id: 'material-size-only',
    colors: '',
    finishing: ''
  }]));

  assert.equal(pricing.findVariantPricingMatrixRow(rows, {
    material: 'Sulfit 75g',
    size: '20x30cm'
  })?.id, 'material-size-only');
  assert.deepEqual(pricing.getVariantPricingTiersForSelection(rows, {
    material: 'Sulfit 75g',
    size: '20x30cm'
  }).map((tier) => tier.min_qty), [10]);
});
