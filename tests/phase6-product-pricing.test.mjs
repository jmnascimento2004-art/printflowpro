import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
async function compile(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', code)(module.exports, module, name => { assert.ok(dependencies[name], name); return dependencies[name]; });
  return module.exports;
}
const costs = await compile('../src/lib/product-costs.ts');
const fields = await compile('../src/lib/product-custom-fields.ts');
const pricing = await compile('../src/lib/pricing.ts');
const dependencies = { './pricing': pricing, './product-custom-fields': fields };
const pos = await compile('../src/lib/pos-cart.ts', dependencies);
const quotes = await compile('../src/lib/quote-text-assistant.ts', dependencies);
const pdf = await import('../src/lib/pdf/pdf-item-view-model.mjs');
const component = { id: 'raw', description: 'Material', type: 'Matéria-prima', unit: 'm²', quantity: 2, unit_cost: 10.125, active: true };
test('cost composition add/edit/remove/disable, rounding and explicit manual override', () => {
  const composition = { version: 1, mode: 'composition', components: [component] };
  assert.equal(costs.resolveProductCost(999, composition), 20.25);
  composition.components.push({ ...component, id: 'labor', quantity: 1, unit_cost: 9.75 });
  assert.equal(costs.resolveProductCost(999, composition), 30);
  composition.components[1].unit_cost = 4.75;
  assert.equal(costs.resolveProductCost(999, composition), 25);
  composition.components[1].active = false;
  assert.equal(costs.resolveProductCost(999, composition), 20.25);
  composition.components.splice(0, 1);
  assert.equal(costs.resolveProductCost(999, composition), 0);
  assert.equal(costs.resolveProductCost(999, { ...composition, mode: 'manual' }), 999);
});
test('cost validation rejects negative, nonfinite and duplicate component values', () => {
  for (const patch of [{ quantity: -1 }, { unit_cost: Infinity }, { description: '' }, { unit: '' }]) assert.ok(costs.validateCostComposition({ components: [{ ...component, ...patch }] }).length);
  assert.ok(costs.validateCostComposition({ components: [component, component] }).length);
});
test('margin and markup are distinct, impossible deductions have no fabricated fallback', () => {
  assert.equal(costs.suggestProductPrice(60, 40, 0, 0), 100);
  assert.equal(costs.suggestProductPrice(60, 40, 0, 0, 'markup', 1.4), 84);
  assert.equal(costs.suggestProductPrice(60, 90, 10, 0), null);
  assert.equal(costs.suggestProductPrice(60, 0, 100, 0, 'markup', 2), null);
  assert.equal(costs.suggestProductPrice(60, 0, 0, 0), 60);
});
for (const preset of costs.PRODUCT_PRICING_PRESETS) test(`preset ${preset.id} contains editable costs and no fixed sales price`, () => {
  let id = 0;
  const composition = costs.createPresetComposition(preset.id, () => String(++id));
  assert.equal(costs.resolveProductCost(0, composition), 0);
  assert.equal(preset.sales_price, undefined);
  composition.components[0].unit_cost = 10;
  assert.equal(costs.resolveProductCost(0, composition), 10);
  const product = { pricing_type: preset.pricingType, sales_price: costs.suggestProductPrice(10, 50, 0, 0) };
  assert.equal(pricing.resolveProductPrice(product, { quantity: 2, width: 1, height: 1, length: 1 }).totalPrice, 40);
});
const tiered = { sales_price: 3, pricing_type: 'unidade', volume_pricing: [{ min_qty: 100, price: 2.1234 }, { min_qty: 500, price: 1.1234 }] };
for (const [quantity, total] of [[1, 3], [99, 297], [100, 212.34], [101, 214.46], [499, 1059.58], [500, 561.7], [501, 562.82], [1000, 1123.4]]) test(`quantity threshold ${quantity} keeps canonical rounding`, () => assert.equal(pricing.resolveProductPrice(tiered, { quantity }).totalPrice, total));
test('client totals and price deltas cannot replace trusted product values', () => {
  const product = { ...tiered, pricing_details: { configurator_options: { option_groups: [{ id: 'finish', name: 'Acabamento', required: true, selection_type: 'single', options: [{ name: 'Laminação', price_delta: 250 }] }] } } };
  const config = { quantity: 100, customOptions: { baseSubtotal: .01, optionSurcharge: .01, selectedOptions: [{ group_id: 'finish', name: 'Laminação', price_delta: .01 }] } };
  assert.equal(pricing.resolveProductPrice(product, config).totalPrice, 250);
  assert.equal(pricing.resolveProductPrice(tiered, { quantity: 100, customOptions: { baseSubtotal: .01, optionSurcharge: .01 } }).totalPrice, 212.34);
});
for (const [type, value] of [['text', 'Maria'], ['textarea', 'Sem recorte'], ['number', 0], ['select', 'A'], ['checkbox', true], ['date', '2026-10-21'], ['measure', .4]]) test(`custom ${type} validates and freezes its typed value`, () => {
  const definition = { id: 'f', label: 'Personalização', type, required: true, options: ['A', 'B'] };
  const result = fields.resolveProductFields([definition], { f: value });
  assert.equal(result.errors.length, 0);
  assert.equal(result.snapshot[0].value, value);
  definition.label = 'Changed';
  assert.equal(result.snapshot[0].label, 'Personalização');
  assert.ok(fields.resolveProductFields([definition], {}).errors.length);
});
test('custom fields reject invalid dates, selections, numeric values and required confirmation', () => {
  for (const [type, value] of [['date', '2026-02-31'], ['select', 'unregistered'], ['number', 'NaN'], ['checkbox', false], ['measure', -1]]) assert.ok(fields.resolveProductFields([{ id: 'f', label: 'Field', type, required: true, options: ['A'] }], { f: value }).errors.length);
});
test('PDV and quote freeze same fields and price; changing product later does not reprice documents', () => {
  const product = { id: 'p', name: 'Fixture', ...tiered, pricing_details: { configurator_options: { custom_fields: [{ id: 'name', label: 'Nome', type: 'text', required: true }] } } };
  const config = { quantity: 100, customOptions: { fieldValues: { name: 'Maria' } } };
  const quote = quotes.buildAssistedQuoteItem(product, config, '');
  const cart = pos.createPOSCartItem(product, config);
  assert.equal(quote.total_price, cart.total_price);
  assert.deepEqual(quote.details.pricing_snapshot.custom_fields, cart.details.pricing_snapshot.custom_fields);
  assert.throws(() => quotes.buildAssistedQuoteItem(product, { quantity: 100 }, ''));
  assert.throws(() => pos.createPOSCartItem(product, { quantity: 100 }));
  product.sales_price = 999;
  product.pricing_details.configurator_options.custom_fields[0].label = 'New label';
  assert.equal(quote.total_price, 212.34);
  assert.equal(pos.posCheckoutItems([cart])[0].details.pricing_snapshot.custom_fields[0].label, 'Nome');
});
test('a fields-only product opens the shared Store and PDV configurator', () => {
  const product = { pricing_details: { configurator_options: { custom_fields: [{ id: 'name', label: 'Nome', type: 'text', required: true }] } } };
  assert.equal(pricing.hasAdvancedConfigurator(product), true);
  assert.equal(pricing.getProductConfigurator(product).custom_fields.length, 1);
});
test('PDF and OS item model retains custom snapshot alongside a matrix configuration', () => {
  const item = { product_name: 'Cartões', quantity: 500, unit_price: .2, total_price: 100, details: {
    configuration_snapshot: { material: 'Triplex', size: '9x5cm', colors: '4x4', finishing: 'Refile' },
    pricing_snapshot: { custom_fields: [{ id: 'name', label: 'Nome', type: 'text', value: 'Maria' }, { id: 'confirm', label: 'Conferido', type: 'checkbox', value: true }] }
  } };
  const result = pdf.buildPdfItemViewModel(item);
  assert.match(result.description, /Nome: Maria/);
  assert.match(result.description, /Conferido: Sim/);
  assert.equal(result.totalPrice, 100);
});
