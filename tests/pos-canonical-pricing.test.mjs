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
const pricing = await compile('../src/lib/pricing.ts');
const pos = await compile('../src/lib/pos-cart.ts', { './pricing': pricing });
const base = { id: 'fixture', name: 'Fixture', pricing_type: 'unidade', sales_price: 59.99 };
const area = { ...base, pricing_type: 'm2', sales_price: 100, pricing_details: { configurator_options: { min_area: .5 } } };
const cases = [
  ['simple cents', base, { quantity: 1 }, 59.99],
  ['simple quantity', base, { quantity: 3 }, 179.97],
  ['m2 below floor', area, { quantity: 1, width: .4, height: .5 }, 50],
  ['m2 above floor', area, { quantity: 1, width: 1, height: 1 }, 100],
  ['m2 1.20x0.80', area, { quantity: 1, width: 1.2, height: .8 }, 96],
  ['m2 multiple', area, { quantity: 3, width: 1.2, height: .8 }, 288],
  ['linear', { ...base, pricing_type: 'linear', sales_price: 10 }, { quantity: 2, length: 2.5 }, 50],
  ...[100, 500, 1000].map(quantity => ['tier '+quantity, { ...base, volume_pricing: [{min_qty:100,price:2},{min_qty:500,price:1.5},{min_qty:1000,price:1}] }, {quantity}, quantity*(quantity===100?2:quantity===500?1.5:1)]),
  ['option', { ...base, pricing_details: { configurator_options: { option_groups: [{id:'finish',name:'Finish',required:true,selection_type:'single',options:[{name:'Gloss',price_delta:75}]}] } } }, {quantity:2,customOptions:{selectedOptions:[{group_id:'finish',name:'Gloss'}]}}, 75]
];
for (const [name, product, config, expected] of cases) test('PDV parity: '+name, () => {
  const canonical = pricing.resolveProductPrice(product, config);
  const item = pos.createPOSCartItem(product, config);
  assert.equal(item.total_price, expected);
  assert.equal(item.unit_price, canonical.unitPrice);
  assert.deepEqual(item.pricing_result, canonical);
  assert.equal(item.details.pricing_snapshot.area, canonical.breakdown.area);
  assert.equal(item.details.pricing_snapshot.billable_area, canonical.breakdown.billableArea);
  assert.deepEqual(pos.posCheckoutItems([item])[0].details.pricing_snapshot.pricing_result, canonical);
});
test('quantity changes preserve physical measures and floor, and checkout freezes snapshot', () => {
  const item = pos.createPOSCartItem(area, {quantity:1,width:.4,height:.5});
  const next = pos.changePOSItemQuantity(area,item,1);
  assert.equal(next.total_price,100); assert.equal(next.details.width,.4); assert.equal(next.details.height,.5);
  assert.equal(next.details.pricing_snapshot.area,.2); assert.equal(next.details.pricing_snapshot.billable_area,.5);
  const saved=pos.posCheckoutItems([next]);
  next.details.pricing_snapshot.area=999;
  assert.equal(saved[0].details.pricing_snapshot.area,.2);
});
test('quantity tier update replaces the previous explicit total', () => {
  const product={...base,volume_pricing:[{min_qty:100,price:2},{min_qty:500,price:1.5}]};
  const item=pos.createPOSCartItem(product,{quantity:100,customOptions:{baseSubtotal:200}});
  const next=pos.changePOSItemQuantity(product,item,1);
  assert.equal(next.quantity,500); assert.equal(next.total_price,750);
  assert.equal(pos.changePOSItemQuantity(product,next,-1).total_price,200);
});
test('incomplete configuration cannot enter checkout', () => {
  const product=cases.at(-1)[1];
  assert.throws(()=>pos.createPOSCartItem(product,{quantity:1}),/Defina/);
});
test('PDV uses persisted canonical line totals throughout cart and checkout', async () => {
  const source=await readFile(new URL('../src/app/(dashboard)/pos/page.tsx',import.meta.url),'utf8');
  assert.match(source,/items: posCheckoutItems\(cart\)/);
  assert.match(source,/const lineTotal = item.total_price/);
  assert.doesNotMatch(source,/getProductUnitPrice|sizeFactor|item\.unit_price\s*\*/);
});

test('plain linear never gains fictitious area dimensions; physical snapshot survives checkout', () => {
  const product={...base,pricing_type:'linear',sales_price:10};
  const item=pos.createPOSCartItem(product,{quantity:1,width:1,height:1,length:2.5});
  const saved=pos.posCheckoutItems([pos.changePOSItemQuantity(product,item,1)])[0];
  assert.equal(saved.details.width,undefined); assert.equal(saved.details.height,undefined);
  assert.equal(saved.details.length,2.5); assert.equal(saved.total_price,50);
  const unit=pos.createPOSCartItem(base,{quantity:1,width:1,height:1,length:1});
  assert.equal(unit.details.width,undefined);assert.equal(unit.details.length,undefined);
});
test('matrix quantity uses exact registered tier and preserves options and notes', () => {
  const product={...base,pricing_details:{configurator_options:{variant_pricing_matrix:[{id:'r',material:'Paper',size:'A4',colors:'4x0',finishing:'Cut',tiers:[{quantity:100,unit_price:2,total_price:200},{quantity:500,unit_price:1.5,total_price:750}]}]}}};
  const config={quantity:100,customOptions:{variantSelection:{material:'Paper',size:'A4',colors:'4x0',finishing:'Cut'}}};
  const item=pos.createPOSCartItem(product,config,{notes:'Urgent',configuration_summary:'Quantidade: 100 | Paper'});
  const next=pos.changePOSItemQuantity(product,item,1);
  assert.equal(next.quantity,500);assert.equal(next.total_price,750);
  assert.equal(next.unit_price,pricing.resolveProductPrice(product,{...config,quantity:500}).unitPrice);
  assert.equal(next.details.notes,'Urgent');assert.match(next.details.configuration_summary,/Quantidade: 500/);
  assert.equal(pos.changePOSItemQuantity(product,next,1),next);
});
