import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as metric from '../src/lib/metric.mjs';
import { buildPdfItemViewModel } from '../src/lib/pdf/pdf-item-view-model.mjs';

async function compile(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function('require', 'exports', 'module', code)(name => {
    if (name in dependencies) return dependencies[name];
    throw Error(`Unexpected import ${name}`);
  }, module.exports, module);
  return module.exports;
}
const pricing = await compile('../src/lib/pricing.ts');

async function declaration(path, name, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let found;
  function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name)found=node;ts.forEachChild(node,visit);}
  visit(ast);assert.ok(found,name);
  const code=ts.transpileModule(`const ${found.getText(ast)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return Function(...Object.keys(dependencies),`${code};return ${name};`)(...Object.values(dependencies));
}

test('saving unrelated product fields preserves every legacy dimension exactly',async()=>{
  const original={min_width:120.123,max_width:250.555,min_height:1.2345,max_height:10,min_length:25.12345};
  const context={saleMode:'linear',registrationType:'standard',allowCustomMeasure:true,changedMetricFields:[],metricConfigurationForSave:metric.metricConfigurationForSave,isEditing:true,
    selectedProduct:{pricing_details:{configurator_options:original}},minWidth:1.20123,minHeight:1.2345,maxWidth:2.50555,maxHeight:10,minLength:25.12345,
    minArea:.5,kitItems:'',configMinQuantity:1,sizeOptions:[],quoteOnRequest:false,customerMessage:'',normalizeConfiguratorGroups:()=>[],normalizeVariantMatrixRows:()=>[],variantPricingMatrix:[]};
  const saved=(await declaration('../src/app/(dashboard)/products/page.tsx','buildConfiguratorOptions',context))();
  for(const key of Object.keys(original))assert.equal(saved[key],original[key]);
  assert.equal(saved.dimension_unit,undefined);
  const edited=(await declaration('../src/app/(dashboard)/products/page.tsx','buildConfiguratorOptions',{...context,changedMetricFields:['min_width'],minWidth:.8}))();
  assert.equal(edited.dimension_unit,'m');assert.equal(edited.min_width,.8);assert.equal(edited.min_length,metric.legacyStoreConfiguredMeters(original.min_length,undefined));assert.equal(edited.min_height,metric.legacyStoreConfiguredMeters(original.min_height,undefined));
  for(const key of ['min_length','min_height','max_width','max_height'])assert.equal(metric.legacyStoreConfiguredMeters(edited[key],edited.dimension_unit),metric.legacyStoreConfiguredMeters(original[key],undefined));
});

test('Store and POS cannot submit zero physical dimensions',async()=>{
  for(const type of ['m2','linear']){
    const invalid=await declaration('../src/components/store/ProductConfiguratorModal.tsx','invalidMeasure',{product:{pricing_type:type},isLinearWidthMode:false,width:0,height:1,length:0});
    assert.equal(invalid,true);
    let added=false;
    const handleAdd=await declaration('../src/components/store/ProductConfiguratorModal.tsx','handleAdd',{isConfigurationUnavailable:true,linearWidthError:'',onAddToCart:()=>{added=true;},buildPayload:()=>({})});
    handleAdd();assert.equal(added,false);
    const posSource=await readFile(new URL('../src/app/(dashboard)/pos/page.tsx',import.meta.url),'utf8');
    assert.match(posSource, /<ProductConfiguratorModal/);

  }
});

test('metric parsing accepts decimal comma/dot without a thousands separator or loss of precision', () => {
  for (const [input, expected] of [['1',1],['1.2',1.2],['1,2',1.2],['1.20',1.2],['1,20',1.2],['0,05',.05],[',5',.5],['1,234567',1.234567]]) {
    assert.equal(metric.parseMetricInput(input), expected);
  }
  for (const invalid of ['abc','-1','NaN','Infinity','1,2.3','1 250','',NaN,Infinity]) assert.equal(metric.parseMetricInput(invalid),null);
});

test('cm input before and meters after produce identical physical dimensions and prices', () => {
  for (const cm of [50,100,120,250]) {
    for (const type of ['m2','linear']) {
      const product = { pricing_type:type, sales_price:70 };
      const before = pricing.resolveProductPrice(product,{width:cm/100,height:.8,length:cm/100,quantity:3});
      const meters = metric.parseMetricInput(String(cm/100).replace('.',','));
      const after = pricing.resolveProductPrice(product,{width:meters,height:.8,length:meters,quantity:3});
      assert.deepEqual(after,before);
    }
  }
});

test('square and linear measure contracts remain physical, independent of quantity and commercial floor', () => {
  for (const [width,height,area] of [[.5,.5,.25],[1,1,1],[1.2,.8,.96],[2.5,1.5,3.75]]) {
    const result = pricing.resolveProductPrice({pricing_type:'m2',sales_price:100},{width,height,quantity:3});
    assert.equal(result.breakdown.area,area);
    assert.equal(result.totalPrice,Math.round(area*100*3*100)/100);
  }
  for (const length of [.5,1,2.5,10]) {
    const result = pricing.resolveProductPrice({pricing_type:'linear',sales_price:20},{length,quantity:3});
    assert.equal(result.breakdown.length,length);
    assert.equal(result.totalPrice,length*20*3);
  }
  for (const [width,height,billed] of [[.4,.5,.5],[.7,1,.7]]) {
    const input={width,height,quantity:3};
    const result=pricing.resolveProductPrice({pricing_type:'m2',sales_price:100,pricing_details:{configurator_options:{min_area:.5}}},input);
    assert.equal(result.breakdown.area,width*height);
    assert.equal(result.breakdown.billableArea,billed);
    assert.deepEqual(input,{width,height,quantity:3});
    assert.equal(result.totalPrice,billed*100*3);
  }
});

test('legacy product defaults stay compatible while explicit meter configuration supports large and precise values', () => {
  for (const value of [.5,1.2345,20,25,120,250.5]) {
    const old=(value<=20?Math.round(value*100):Math.round(value))/100;
    assert.equal(metric.legacyStoreConfiguredMeters(value,undefined),old);
    assert.equal(metric.configuredMeters(value,'m'),value);
    assert.equal(metric.legacyStoreConfiguredMeters(value,'m'),value);
  }
  assert.equal(metric.configuredMeters(120.123,undefined),1.20123);
  assert.equal(metric.configuredMeters(1.2345,undefined),1.2345);
});

test('PDF formats canonical meters without mutating historical prices, size strings or snapshots', () => {
  const item={quantity:3,unit_price:67.2,total_price:201.6,details:{width:1.2,height:.8,pricing_snapshot:{size:'120x80cm'}}};
  const copy=structuredClone(item);
  const view=buildPdfItemViewModel(item);
  assert.equal(view.size.replaceAll('\u00a0',' '),'1,20 m × 0,80 m');
  assert.equal(view.totalPrice,201.6);
  assert.deepEqual(item,copy);
  assert.equal(buildPdfItemViewModel({details:{configuration_snapshot:{size:'120x80cm'}}}).size.replaceAll('\u00a0',' '),'120 × 80 cm');
});

test('MetricInput preserves partial decimal drafts and emits canonical numbers for mobile input', async () => {
  const slots=[];let cursor=0;let effects=[];let value=1;
  const react={
    useState(initial){const i=cursor++;if(!(i in slots)) slots[i]=initial;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},
    useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},
    useEffect(fn){effects.push(fn);}
  };
  const {MetricInput}=await compile('../src/components/MetricInput.tsx',{'react':react,'react/jsx-runtime':{jsx:(_,props)=>props},'@/lib/metric.mjs':metric});
  const render=()=>{cursor=0;effects=[];const props=MetricInput({value,onValueChange:next=>{value=next;},'aria-label':'Largura (m)'});effects.forEach(fn=>fn());return props;};
  let input=render();assert.equal(input.inputMode,'decimal');assert.equal(input.type,'text');input.onFocus({});
  for(const [draft,expected] of [[',',0],[',5',.5],['',0],['1,20',1.2],['0,05',.05],['2.50001',2.50001]]) {
    input.onChange({target:{value:draft}});input=render();assert.equal(input.value,draft);assert.equal(value,expected);
  }
  input.onChange({target:{value:'-1'}});assert.equal(value,2.50001);
});
