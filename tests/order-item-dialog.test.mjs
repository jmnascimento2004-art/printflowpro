import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/app/(dashboard)/orders/page.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('orders.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['handleOpenItemEditor','handleAddEditItem', 'closeItemDialog', 'confirmItemDialog', 'updateEditItem', 'getManualPricingType', 'normalizeOrderItemPricingType'];
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
  const state = {items:[existing],draft:null,editingId:null,error:'',submitted:{current:false}};
  const assign = key => value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  function render() {
    const dependencies = {editingItemId:state.editingId,editItems:state.items,setEditingItemId:assign('editingId'),itemDraft:state.draft,editingOrder:{id:'order'},itemSubmitted:state.submitted,setItemDraft:assign('draft'),setItemError:assign('error'),setEditItems:assign('items'),recalculateOrderItem:item=>item,showToast(){}};
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
  h.render().closeItemDialog();
  assert.deepEqual(h.state.items,[h.existing]);assert.equal(h.state.draft,null);
  h.render().handleAddEditItem();assert.notEqual(h.state.draft.id,firstId);assert.equal(h.state.draft.product_name,'');
});

test('confirmation appends exactly once, preserves original items and closes the popup', () => {
  const h=harness();h.render().handleAddEditItem();
  h.render().updateEditItem(h.state.draft.id,item=>({...item,product_name:'  Banner  ',quantity:2,unit_price:30,total_price:60,details:{notes:'Acabamento'}}));
  const api=h.render();api.confirmItemDialog(event);api.confirmItemDialog(event);
  assert.equal(h.state.items.length,2);assert.equal(h.state.items[0],h.existing);
  assert.equal(h.state.items[1].product_name,'Banner');assert.equal(h.state.items[1].total_price,60);
  assert.equal(h.state.items[1].details.notes,'Acabamento');assert.equal(h.state.draft,null);
});

test('incomplete description, quantity or metric dimensions cannot enter the order', () => {
  for (const patch of [{product_name:'   '},{product_name:'Item',quantity:0},{product_name:'Item',details:{manual_pricing_type:'m2',width:1,height:0}},{product_name:'Item',details:{manual_pricing_type:'linear',length:0}}]) {
    const h=harness();h.render().handleAddEditItem();Object.assign(h.state.draft,patch);
    h.render().confirmItemDialog(event);
    assert.equal(h.state.items.length,1);assert.ok(h.state.draft);assert.ok(h.state.error);
  }
});

test('configurator results stay in the draft until confirmation; existing-item editing still works', () => {
  const h=harness();h.render().handleAddEditItem();
  const configured={product_id:'catalog',product_name:'Configured',quantity:2,unit_price:70,total_price:140,details:{pricing_snapshot:{source:'catalog'},selected_options:[{name:'Finish'}]}};
  h.render().updateEditItem(h.state.draft.id,item=>({...item,...configured}));
  assert.deepEqual(h.state.items,[h.existing]);assert.equal(h.state.draft.details,configured.details);
  h.render().confirmItemDialog(event);
  assert.equal(h.state.items[1].details,configured.details);
  h.render().updateEditItem('existing',item=>({...item,product_name:'Edited'}));
  assert.equal(h.state.items[0].product_name,'Edited');assert.equal(h.state.items[1].product_name,'Configured');
});

test('editing is isolated, cancellation preserves nested configuration and existing totals', () => {
  const h=harness();
  h.existing.details={pricing_snapshot:{source:'historical',minimum_area:1},notes:'Original note'};
  h.render().handleOpenItemEditor(h.existing);
  assert.equal(h.state.editingId,'existing');
  assert.notEqual(h.state.draft.details,h.existing.details);
  h.state.draft.details.pricing_snapshot.minimum_area=2;
  h.render().updateEditItem('existing',item=>({...item,quantity:3,total_price:75}));
  assert.equal(h.state.items[0].quantity,1);
  h.render().closeItemDialog();
  assert.equal(h.state.items[0].total_price,25);
  assert.equal(h.state.items[0].details.pricing_snapshot.minimum_area,1);
});

test('applying an edit replaces its item once, retaining identity, position and other items', () => {
  const h=harness();const other={id:'second',product_name:'Untouched',quantity:1,total_price:10};
  h.state.items.push(other);h.existing.order_id='order';h.existing.outsourced=true;
  h.render().handleOpenItemEditor(h.existing);
  h.render().updateEditItem('existing',item=>({...item,product_name:'Updated',quantity:2,total_price:50}));
  const api=h.render();api.confirmItemDialog(event);api.confirmItemDialog(event);
  assert.equal(h.state.items.length,2);assert.equal(h.state.items[0].id,'existing');
  assert.equal(h.state.items[0].order_id,'order');assert.equal(h.state.items[0].outsourced,true);
  assert.equal(h.state.items[0].total_price,50);assert.equal(h.state.items[1],other);
  h.render().handleAddEditItem();assert.equal(h.state.editingId,null);
  h.render().updateEditItem(h.state.draft.id,item=>({...item,product_name:'Additional'}));
  h.render().confirmItemDialog(event);assert.equal(h.state.items.length,3);
});

test('notes-only historical edits preserve missing legacy dimensions; new invalid measures are rejected', () => {
  const h=harness();h.existing.details={manual_pricing_type:'m2',notes:'Historic'};
  h.render().handleOpenItemEditor(h.existing);
  h.render().updateEditItem('existing',item=>({...item,details:{...item.details,notes:'Revised'}}));
  h.render().confirmItemDialog(event);assert.equal(h.state.draft,null);
  assert.equal(h.state.items[0].total_price,25);
  h.render().handleOpenItemEditor(h.state.items[0]);
  h.render().updateEditItem('existing',item=>({...item,details:{...item.details,width:1,height:0}}));
  h.render().confirmItemDialog(event);assert.ok(h.state.error);assert.ok(h.state.draft);
  assert.equal(h.state.items[0].details.width,undefined);
});
