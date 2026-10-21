import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function compile(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', code)(module.exports, module);
  return module.exports;
}
const pricing = await compile('../src/lib/pricing.ts');
const shipping = await compile('../src/lib/shipment-state.ts');
const product = { pricing_type: 'm2', sales_price: 100, pricing_details: { configurator_options: { min_area: 0.5, sale_mode: 'm2' } } };

async function declarations(path, names, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Map();
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) found.set(node.name.text, `const ${node.getText(ast)};`);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  names.forEach(name => assert.ok(found.has(name), name));
  const code = ts.transpileModule(names.map(name => found.get(name)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return Function(...Object.keys(dependencies), `${code}; return {${names.join(',')}}`)(...Object.values(dependencies));
}

test('order editing preserves an unopened commercial snapshot and reapplies the same floor on edits', async () => {
  const { recalculateOrderItem } = await declarations('../src/app/(dashboard)/orders/page.tsx', ['recalculateOrderItem'], {
    getManualPricingType: item => item.details.pricing_type,
    getOrderItemSizeLabel: () => '20x100cm', resolveBillableArea: pricing.resolveBillableArea
  });
  const item = { quantity: 3, unit_price: 50, total_price: 150, details: { pricing_type: 'm2', width: 0.2, height: 1,
    pricing_snapshot: { minimum_area: 0.5, billable_area: 0.5, area: 0.2, unit_price_basis: 'piece', base_unit_price: 100 } } };
  assert.equal(recalculateOrderItem(item), item);
  const quantityEdit = recalculateOrderItem({ ...item, quantity: 4 }, 'quantity');
  assert.equal(quantityEdit.total_price, 200);
  assert.equal(quantityEdit.details.width, 0.2);
  assert.equal(quantityEdit.details.area_total, 0.8);
  assert.equal(quantityEdit.details.pricing_snapshot.billable_area, 0.5);
  const measureEdit = recalculateOrderItem({ ...item, details: { ...item.details, width: 0.7 } }, 'measure');
  assert.equal(measureEdit.total_price, 210);
  assert.equal(measureEdit.unit_price, 70);
  const linear = { quantity: 3, unit_price: 20, total_price: 60, details: { pricing_type: 'linear', length: 0.2,
    pricing_snapshot: { measure_basis: 'length', unit_price_basis: 'piece', base_unit_price: 100 } } };
  const linearEdit = recalculateOrderItem({ ...linear, quantity: 4 }, 'quantity');
  assert.equal(linearEdit.total_price, 80);
  assert.equal(linearEdit.unit_price, 20);
  assert.equal(linearEdit.details.length, 0.2);
  const widthLinear = { ...item, details: { ...item.details, pricing_type: 'linear',
    pricing_snapshot: { ...item.details.pricing_snapshot, measure_basis: 'area' } } };
  const heightEdit = recalculateOrderItem({ ...widthLinear, details: { ...widthLinear.details, height: 4 } }, 'measure');
  assert.equal(heightEdit.total_price, 240);
});

test('quote price preview consumes canonical pricing for the actual dimensions', async () => {
  const quoteProduct = { ...product, id: 'p' };
  const { getProductPriceInfo } = await declarations('../src/app/(dashboard)/quotes/page.tsx', ['getProductPriceInfo'], {
    products: [quoteProduct], selectedProductId: 'p', effectiveQuantityTiers: [], itemQty: 3,
    itemWidth: 0.2, itemHeight: 1, resolveProductPrice: pricing.resolveProductPrice
  });
  assert.equal(getProductPriceInfo('p').price, 50);
  assert.equal(getProductPriceInfo('p').areaPricing, true);
});

test('quote cannot insert a product whose required configuration is unresolved', async () => {
  const requiredProduct = { ...product, id: 'p', pricing_details: { configurator_options: {
    min_area: 0.5, option_groups: [{ id: 'finish', name: 'Acabamento', required: true, selection_type: 'single', options: [{ name: 'Refile', price_delta: 0 }] }]
  } } };
  const alerts = [];
  let inserted = false;
  const { handleAddItem } = await declarations('../src/app/(dashboard)/quotes/page.tsx', ['handleAddItem'], {
    isManualQuoteItem: false, products: [requiredProduct], selectedProductId: 'p', requiresTierSelection: false,
    getProductVolumeTiers: () => [], itemQty: 1, itemWidth: 0.2, itemHeight: 1,
    getProductPriceInfo: () => ({ price: 0, volumeTier: null }), hasVariantPricingMatrix: false,
    resolveProductPrice: pricing.resolveProductPrice, alert: value => alerts.push(value), setItems: () => { inserted = true; }
  });
  handleAddItem();
  assert.equal(inserted, false);
  assert.equal(alerts.length, 1);
});

test('Store payload retains physical dimensions, quantity and billable snapshot', async () => {
  const resolution = pricing.resolveProductPrice(product, { width: 0.2, height: 1, quantity: 3 });
  const { buildPayload } = await declarations('../src/components/store/ProductConfiguratorModal.tsx', ['buildPayload'], {
    product, breakdown: resolution.breakdown, unitPriceForCart: resolution.unitPrice, subtotalForCart: resolution.totalPrice,
    selectedOptions: [], dimensions: { width: 0.2, height: 1 }, additionalDays: 0,
    resolvedProductionTime: '', resolvedProductionTimeSource: 'fallback', saleMode: 'm2', saleModeLabel: 'm²',
    configurationSummary: 'real 0.2, billable 0.5', configurationSnapshot: undefined
  });
  const payload = buildPayload();
  assert.equal(payload.quantity, 3);
  assert.deepEqual(payload.dimensions, { width: 0.2, height: 1 });
  assert.equal(payload.total_price, 150);
  assert.equal(payload.pricing_snapshot.area, 0.2);
  assert.equal(payload.pricing_snapshot.billable_area, 0.5);
});

for (const [width, expected] of [[0.2, 0.5], [0.5, 0.5], [0.7, 0.7]]) {
  for (const quantity of [1, 3]) {
    test(`real ${width}, floor 0.5, quantity ${quantity}`, () => {
      const config = { width, height: 1, quantity };
      const original = structuredClone(config);
      const result = pricing.resolveProductPrice(product, config);
      assert.equal(result.breakdown.area, width);
      assert.equal(result.breakdown.billableArea, expected);
      assert.equal(result.breakdown.quantity, quantity);
      assert.equal(result.breakdown.baseSubtotal, expected * 100 * quantity);
      assert.equal(result.totalPrice, expected * 100 * quantity);
      assert.equal(result.unitPrice, expected * 100);
      assert.deepEqual(config, original);
    });
  }
}
test('missing dimensions cannot charge the floor; plain linear has no invented minimum', () => {
  assert.equal(pricing.resolveProductPrice(product, {}).totalPrice, 0);
  const linear = { ...product, pricing_type: 'linear' };
  const result = pricing.resolveProductPrice(linear, { length: 0.2, quantity: 2 });
  assert.equal(result.totalPrice, 40);
  assert.equal(result.breakdown.length, 0.2);
  assert.equal(result.breakdown.minimumArea, 0);
});

test('quantity tier fixed totals cannot bypass the floor or diverge between Store and Quote', () => {
  const tiered = { ...product, volume_pricing: [{ min_qty: 10, price: 100, total: 1000 }] };
  const config = { width: 0.2, height: 1, quantity: 10 };
  const quote = pricing.resolveProductPrice(tiered, config);
  const store = pricing.resolveProductPrice(tiered, { ...config, customOptions: { baseSubtotal: 1000 } });
  assert.equal(quote.totalPrice, 500);
  assert.equal(store.totalPrice, quote.totalPrice);
  assert.equal(store.breakdown.area, 0.2);
});
test('linear with width uses the configured area floor while keeping physical measure', () => {
  const linear = { ...product, pricing_type: 'linear', pricing_details: { configurator_options: { min_area: 0.5, max_width: 100 } } };
  const result = pricing.resolveProductPrice(linear, { width: 0.2, height: 1, length: 0.2, quantity: 2 });
  assert.equal(result.breakdown.area, 0.2);
  assert.equal(result.breakdown.length, 0.2);
  assert.equal(result.totalPrice, 100);
});
test('delivery cannot be reverted by stale realtime, reload or order-command responses', () => {
  const current = { id: 's', company_id: 'a', status: 'em_rota', updated_at: '2026-10-21T15:00:00.000002+00:00' };
  const stale = { ...current, status: 'enviado', updated_at: '2026-10-21T15:00:00.000001+00:00' };
  assert.deepEqual(shipping.replaceShipment([current], stale), [current]);
  assert.deepEqual(shipping.mergeShipmentSnapshot([current], [stale]), [current]);
  assert.deepEqual(shipping.replaceShipment([current], { ...current, company_id: 'b' }), [current]);
  assert.deepEqual(shipping.replaceShipment([current], { ...stale, updated_at: '2026-10-21T12:00:00.000001-03:00' }), [current]);
  assert.deepEqual(shipping.replaceShipment([current], { ...stale, updated_at: 'invalid' }), [current]);
  const newer = { ...current, status: 'entregue', updated_at: '2026-10-21T15:00:01+00:00' };
  assert.deepEqual(shipping.replaceShipment([current], newer), [newer]);
});
