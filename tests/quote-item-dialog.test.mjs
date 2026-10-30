import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source=await readFile(new URL('../src/app/(dashboard)/quotes/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('quotes.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=['openQuoteItemDialog','closeQuoteItemDialog','commitQuoteItem','confirmQuoteItemDialog'];
const declarations=[];
function visit(node){if(ts.isVariableDeclaration(node)&&names.includes(node.name.getText(ast)))declarations.push(`const ${node.getText(ast)};`);ts.forEachChild(node,visit);}
visit(ast);assert.equal(declarations.length,names.length);
const js=ts.transpileModule(declarations.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function harness(){
  const original={id:'saved',product_id:'catalog',product_name:'Historical',quantity:2,unit_price:12,total_price:23,details:{notes:'Original',pricing_snapshot:{custom_fields:[{id:'text',value:'Original field'}],total_price:23}}};
  const state={items:[original],itemOriginal:{current:null},itemBaseline:{current:''},itemSubmitted:{current:false},editingItemIndex:null,itemNotes:'',itemDialogOpen:false};
  const setters=['SelectedProductId','ItemQty','ItemWidth','ItemHeight','ManualItemDescription','ManualPricingType','ManualUnitPrice','SelectedMaterial','SelectedMatrixSize','SelectedMatrixColors','SelectedFinishing','ProductFieldValues','ItemNotes','EditingItemIndex','ItemDialogOpen','Items'];
  const deps={MANUAL_QUOTE_ITEM_ID:'__manual_quote_item__',quotePending:false,quoteItemUnchanged:false,isManualQuoteItem:false,selectedProduct:{id:'catalog'},showFeedback(){state.warning=true;},handleAddItem(){state.repriced=true;}};
  for(const name of setters){const key=name[0].toLowerCase()+name.slice(1);deps[`set${name}`]=value=>{state[key]=typeof value==='function'?value(state[key]):value;};}
  return {state,original,render(overrides={}){const values={...deps,...state,...overrides};return Function(...Object.keys(values),`${js};return {${names.join(',')}}`)(...Object.values(values));}};
}
const event={preventDefault(){}};
test('quote editor isolates nested values and cancelling leaves the original untouched',()=>{
  const h=harness();h.render().openQuoteItemDialog(0);
  h.state.itemOriginal.current.details.pricing_snapshot.custom_fields[0].value='Changed';
  h.state.productFieldValues.text='Draft';h.render().closeQuoteItemDialog();
  assert.equal(h.original.details.pricing_snapshot.custom_fields[0].value,'Original field');
  assert.equal(h.state.items[0],h.original);assert.equal(h.state.itemDialogOpen,false);
  h.render().openQuoteItemDialog();assert.equal(h.state.itemOriginal.current,null);assert.deepEqual(h.state.productFieldValues,{});
});
test('notes-only editing preserves historical pricing and identity without repricing',()=>{
  const h=harness();h.render().openQuoteItemDialog(0);h.state.itemNotes='Revised';
  h.render({quoteItemUnchanged:true}).confirmQuoteItemDialog(event);
  assert.equal(h.state.items.length,1);assert.equal(h.state.items[0].id,'saved');
  assert.equal(h.state.items[0].total_price,23);assert.equal(h.state.items[0].details.pricing_snapshot.total_price,23);
  assert.equal(h.state.items[0].details.notes,'Revised');assert.equal(h.state.repriced,undefined);
});
test('editing replaces exactly once and adding appends without losing existing entries',()=>{
  const h=harness();h.render().openQuoteItemDialog(0);
  const api=h.render();const changed={...h.original,id:'wrong',quantity:3,total_price:36};api.commitQuoteItem(changed);api.commitQuoteItem(changed);
  assert.equal(h.state.items.length,1);assert.equal(h.state.items[0].id,'saved');assert.equal(h.state.items[0].quantity,3);
  h.render().openQuoteItemDialog();h.render().commitQuoteItem({product_id:'',product_name:'New',quantity:1,unit_price:10,total_price:10});
  assert.equal(h.state.items.length,2);assert.equal(h.state.items[0].quantity,3);
});
test('configuration changes use existing pricing validation, missing products and pending saves cannot submit',()=>{
  const h=harness();h.render().openQuoteItemDialog(0);
  h.render({quotePending:true}).confirmQuoteItemDialog(event);assert.equal(h.state.repriced,undefined);
  h.render({selectedProduct:undefined}).confirmQuoteItemDialog(event);assert.equal(h.state.warning,true);assert.equal(h.state.repriced,undefined);
  h.render().confirmQuoteItemDialog(event);assert.equal(h.state.repriced,true);assert.equal(h.state.items[0],h.original);
});
