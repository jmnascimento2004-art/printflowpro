import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/app/(dashboard)/orders/page.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('orders.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['handleAddEditItem', 'closeNewOrderItem', 'confirmNewOrderItem', 'updateEditItem', 'getManualPricingType', 'normalizeOrderItemPricingType'];
const declarations = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) declarations.set(node.name.getText(ast), `const ${node.getText(ast)};`);
  ts.forEachChild(node, visit);
}
visit(ast);
for (const name of names) assert.ok(declarations.has(name), name);
const javascript = ts.transpileModule([...declarations.values()].join('\n'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function harness() {
  const existing = {id:'existing',product_name:'Original',quantity:1,total_price:25};
  const state = {items:[existing],draft:null,error:'',submitted:{current:false}};
  const assign = key => value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  function render() {
    const dependencies = {newOrderItem:state.draft,editingOrder:{id:'order'},newItemSubmitted:state.submitted,setNewOrderItem:assign('draft'),setNewItemError:assign('error'),setEditItems:assign('items'),recalculateOrderItem:item=>item,showToast(){}};
    return Function(...Object.keys(dependencies), `${javascript};return {${names.join(',')}}`)(...Object.values(dependencies));
  }
  return {state,render,existing};
}
const event = {preventDefault(){}};

test('opening and cancelling an item preserves the order and discards the draft', () => {
  const h=harness();h.render().handleAddEditItem();
  assert.equal(h.state.items.length,1);assert.equal(h.state.draft.product_name,'');
  const firstId=h.state.draft.id;
  h.render().updateEditItem(firstId,item=>({...item,product_name:'Discarded'}));
  h.render().closeNewOrderItem();
  assert.deepEqual(h.state.items,[h.existing]);assert.equal(h.state.draft,null);
  h.render().handleAddEditItem();assert.notEqual(h.state.draft.id,firstId);assert.equal(h.state.draft.product_name,'');
});

test('confirmation appends exactly once, preserves original items and closes the popup', () => {
  const h=harness();h.render().handleAddEditItem();
  h.render().updateEditItem(h.state.draft.id,item=>({...item,product_name:'  Banner  ',quantity:2,unit_price:30,total_price:60,details:{notes:'Acabamento'}}));
  const api=h.render();api.confirmNewOrderItem(event);api.confirmNewOrderItem(event);
  assert.equal(h.state.items.length,2);assert.equal(h.state.items[0],h.existing);
  assert.equal(h.state.items[1].product_name,'Banner');assert.equal(h.state.items[1].total_price,60);
  assert.equal(h.state.items[1].details.notes,'Acabamento');assert.equal(h.state.draft,null);
});

test('incomplete description, quantity or metric dimensions cannot enter the order', () => {
  for (const patch of [{product_name:'   '},{product_name:'Item',quantity:0},{product_name:'Item',details:{manual_pricing_type:'m2',width:1,height:0}},{product_name:'Item',details:{manual_pricing_type:'linear',length:0}}]) {
    const h=harness();h.render().handleAddEditItem();Object.assign(h.state.draft,patch);
    h.render().confirmNewOrderItem(event);
    assert.equal(h.state.items.length,1);assert.ok(h.state.draft);assert.ok(h.state.error);
  }
});

test('configurator results stay in the draft until confirmation; existing-item editing still works', () => {
  const h=harness();h.render().handleAddEditItem();
  const configured={product_id:'catalog',product_name:'Configured',quantity:2,unit_price:70,total_price:140,details:{pricing_snapshot:{source:'catalog'},selected_options:[{name:'Finish'}]}};
  h.render().updateEditItem(h.state.draft.id,item=>({...item,...configured}));
  assert.deepEqual(h.state.items,[h.existing]);assert.equal(h.state.draft.details,configured.details);
  h.render().confirmNewOrderItem(event);
  assert.equal(h.state.items[1].details,configured.details);
  h.render().updateEditItem('existing',item=>({...item,product_name:'Edited'}));
  assert.equal(h.state.items[0].product_name,'Edited');assert.equal(h.state.items[1].product_name,'Configured');
});
