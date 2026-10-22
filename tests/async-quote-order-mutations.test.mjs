import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Execute the actual handlers/helpers, extracting declarations with the TS AST.
// No duplicated implementation and no React/browser internals in the harness.
async function declarations(path, names, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Map();
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) found.set(node.name.text, `const ${node.getText(ast)};`);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  names.forEach(name => assert.ok(found.has(name), `missing production handler ${name}`));
  const output = ts.transpileModule(names.map(name => found.get(name)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return Function(...Object.keys(dependencies), `${output}; return {${names.join(',')}}`)(...Object.values(dependencies));
}
const serviceSource = await readFile(new URL('../src/lib/persistence/persistence-service.ts', import.meta.url),'utf8');
const mod = { exports: {} };
Function('require','exports','module',ts.transpileModule(serviceSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(()=>({supabase:{}}),mod.exports,mod);
const { PersistenceMutationError, getPersistenceErrorMessage, deleteTenantRecord } = mod.exports;
const deferred = () => { let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; };
const item={id:'i1',product_id:'p1',product_name:'Fixture',quantity:1,unit_price:10,total_price:10};
const quote={id:'q1',company_id:'a',number:1001,customer_id:'c1',customer_name:'Fixture',total_amount:10,discount:0,updated_at:'v1',items:[item]};
const order={...quote,id:'o1',number:'PED-1'};

async function context({response, latest=quote, deleteResponse={data:{id:'q1'},error:null}, refetchError=null}={}) {
  const events=[],calls=[],filters=[];let quotes=[quote],orders=[order];
  const client={rpc(name,args){calls.push({name,args});return {abortSignal(){return response;}};},from(table){
    let deleting=false;const chain={delete(){deleting=true;return chain;},select(){return chain;},eq(k,v){filters.push([table,k,v]);return chain;},abortSignal(){return chain;},maybeSingle(){return Promise.resolve(deleting?deleteResponse:{data:latest?{...latest,quote_items:latest.items,order_items:latest.items}:null,error:refetchError});}};return chain;
  }};
  const names=['normalizeQuotePayload','normalizeOrderPayload','upsertQuoteState','upsertOrderState','refetchQuote','refetchOrder','saveQuoteWithItems','saveOrderWithItems','addQuote','updateQuote','deleteQuote','updateOrder'];
  const api=await declarations('../src/context/database-context.tsx',names,{
    supabase:client,PersistenceMutationError,getPersistenceErrorMessage,currentCompanyId:'a',quotes,orders,
    setQuotes(fn){quotes=fn(quotes);events.push('quotes');},setOrders(fn){orders=fn(orders);events.push('orders');},
    persistQuotesSnapshot(){},persistOrdersSnapshot(){},warnCaught(){},createOperationId:()=> 'new-q',
    applyProductionQueueInsertions(){events.push('production');},deleteTenantRecord:(...args)=>deleteTenantRecord(...args,client)
  });
  return {api,events,calls,filters,get quotes(){return quotes;},get orders(){return orders;}};
}
for(const [method,entity,key] of [['addQuote',quote,'quote'],['updateQuote',quote,'quote'],['updateOrder',order,'order']]) {
  test(`${method}: pending means no local confirmation; return canonical server row`,async()=>{
    const wait=deferred(),c=await context({response:wait.promise});let done=false;
    const pending=c.api[method](entity).then(value=>{done=true;return value;});
    assert.equal(done,false);assert.deepEqual(c.events,[]);
    wait.resolve({data:{result_status:'UPDATED',payload:{[key]:{...entity,id:method==='addQuote'?'new-q':entity.id,number:9001,updated_at:'v2'},items:[item]},production:[]},error:null});
    const value=await pending;assert.equal(value.number,key==='quote'?9001:9001);assert.equal(value.updated_at,'v2');assert.ok(c.events.length);
    assert.equal(c.calls[0].args.p_expected_updated_at,'v1');
  });
  for(const [label,response] of [
    ['Supabase error',{error:{message:'SQL secret'},data:null}],
    ['RPC forbidden',{error:null,data:{result_status:'NOT_AUTHORIZED'}}],
    ['invalid response',{error:null,data:null}],
    ['incomplete aggregate',{error:null,data:{result_status:'UPDATED',payload:{[key]:{},items:[]}}}]
  ])test(`${method}: ${label} rejects without updating UI`,async()=>{
    const c=await context({response:Promise.resolve(response)});await assert.rejects(c.api[method](entity));assert.deepEqual(c.events,[]);
  });
  for(const error of [new TypeError('fetch failed SQL secret'),new DOMException('timeout','TimeoutError')])test(`${method}: ${error.name} propagates and is sanitized`,async()=>{
    const wait=deferred(),c=await context({response:wait.promise});const pending=c.api[method](entity);wait.reject(error);
    await assert.rejects(pending,e=>getPersistenceErrorMessage(e).includes('Verifique a conexão'));assert.deepEqual(c.events,[]);
  });
}
for(const [method,entity] of [['updateQuote',quote],['updateOrder',order]]){
  test(`${method}: stale edit refetches canonical aggregate and rejects`,async()=>{
    const latest={...entity,updated_at:'v2',notes:'remote'};const c=await context({response:Promise.resolve({data:{result_status:'CONFLICT'},error:null}),latest});
    await assert.rejects(c.api[method](entity),e=>e.code==='CONFLICT'&&e.latest.notes==='remote');assert.equal(c.calls[0].args.p_expected_updated_at,'v1');
    assert.ok(c.filters.some(f=>f[1]==='company_id'&&f[2]==='a'));
  });
  test(`${method}: foreign tenant and missing version fail before RPC`,async()=>{
    const c=await context();await assert.rejects(c.api[method]({...entity,company_id:'b'}),e=>e.code==='NOT_AUTHORIZED');await assert.rejects(c.api[method]({...entity,updated_at:undefined}),e=>e.code==='CONFLICT');assert.equal(c.calls.length,0);
  });
}
test('deleteQuote: confirmed deletion removes local row and filters tenant/version',async()=>{
  const c=await context();await c.api.deleteQuote('q1');assert.equal(c.quotes.length,0);assert.ok(c.filters.some(f=>f[1]==='company_id'&&f[2]==='a'));assert.ok(c.filters.some(f=>f[1]==='updated_at'&&f[2]==='v1'));
});
for(const response of [{data:null,error:{code:'42501',message:'SQL secret'}},{data:null,error:null}])test('deleteQuote: denial/zero affected rows rejects and restores remote state',async()=>{
  const c=await context({deleteResponse:response,latest:{...quote,updated_at:'v2'}});await assert.rejects(c.api.deleteQuote('q1'));assert.equal(c.quotes.length,1);assert.equal(c.quotes[0].updated_at,'v2');
});
test('deleteQuote: lost response reconciles confirmed absence without success',async()=>{
  const c=await context({deleteResponse:{data:null,error:{message:'network'}},latest:null});await assert.rejects(c.api.deleteQuote('q1'));assert.equal(c.quotes.length,0);
});
test('conflict refetch failure rejects without claiming current state was loaded',async()=>{
  const c=await context({response:Promise.resolve({data:{result_status:'CONFLICT'}}),refetchError:{message:'offline'}});await assert.rejects(c.api.updateQuote(quote),/Não foi possível carregar/);assert.deepEqual(c.events,[]);
});
async function quoteUI(update=false) {
  const events=[],wait=deferred(),lock={current:false};let count=0;
  const deps={quoteMutationRef:lock,setQuotePending:v=>events.push(['pending',v]),customers:[{id:'c1',name:'Fixture'}],customerId:'c1',items:[item],getSubtotal:()=>10,getServicesTotal:()=>0,deliveryFee:0,discountInput:'0',discountMode:'fixed',calculateQuoteDiscount:()=>0,calculateQuoteNetTotal:()=>10,editingQuoteId:update?'q1':null,quotes:[{...quote,updated_at:'v2'}],company:{id:'a'},editingQuoteVersion:'v1',validUntil:'2026-12-01',notes:'typed',additionalServices:[],deliveryType:'retirada',deliveryAddress:'',deliveryDistanceKm:0,
    addQuote:async()=>{count++;return wait.promise;},updateQuote:async value=>{events.push(['version',value.updated_at]);count++;return wait.promise;},showFeedback:msg=>events.push(['alert',msg]),resetForm:()=>events.push(['close']),handleStartEdit:latest=>events.push(['reload',latest]),PersistenceMutationError,getPersistenceErrorMessage};
  const api=await declarations('../src/app/(dashboard)/quotes/page.tsx',['handleSaveQuote'],deps);return {api,events,wait,get count(){return count;}};
}
for(const update of [false,true])for(const outcome of ['success','failure','conflict'])test(`quote UI ${update?'edit':'create'} ${outcome}: timing, double click, recovery`,async()=>{
  const c=await quoteUI(update);const pending=c.api.handleSaveQuote('rascunho');await c.api.handleSaveQuote('rascunho');assert.equal(c.count,1);assert.deepEqual(c.events.filter(e=>['close','alert'].includes(e[0])),[]);
  if(outcome==='success')c.wait.resolve(quote);else c.wait.reject(outcome==='conflict'?new PersistenceMutationError('CONFLICT','Conflito',quote):new Error('SQL secret'));
  await pending;assert.equal(c.events.some(e=>e[0]==='close'),outcome==='success');assert.deepEqual(c.events.at(-1),['pending',false]);if(update)assert.ok(c.events.some(e=>e[0]==='version'&&e[1]==='v1'));
  if(outcome==='failure')assert.ok(c.events.some(e=>e[0]==='alert'&&!e[1].includes('SQL')));if(outcome==='conflict')assert.ok(c.events.some(e=>e[0]==='reload'));
});
test('WhatsApp side effects wait for quote persistence and stop on failure',async()=>{
  const events=[],wait=deferred();const api=await declarations('../src/app/(dashboard)/quotes/page.tsx',['sendQuoteProposalWhatsApp'],{quoteMutationRef:{current:false},setQuotePending(){},updateQuote:()=>wait.promise,resolveOperationalWhatsAppMessage:()=>{events.push('whatsapp');},session:{access_token:'fixture'},getPersistenceErrorMessage,showFeedback:()=>events.push('error')});
  const pending=api.sendQuoteProposalWhatsApp({...quote,status:'rascunho'});assert.deepEqual(events,[]);wait.reject(new Error('offline'));await pending;assert.deepEqual(events,['error']);
});
test('all seven callers use await or the guarded awaited delete handler; forms expose busy state',async()=>{
  const q=await readFile(new URL('../src/app/(dashboard)/quotes/page.tsx',import.meta.url),'utf8');const o=await readFile(new URL('../src/app/(dashboard)/orders/page.tsx',import.meta.url),'utf8');const s=await readFile(new URL('../src/app/store/page.tsx',import.meta.url),'utf8');
  assert.equal((q.match(/await updateQuote\(/g)||[]).length,2);assert.equal((q.match(/await addQuote\(/g)||[]).length,1);assert.equal((q.match(/handleDeleteQuote\(quote.id\)/g)||[]).length,2);assert.match(o,/await updateOrder\(/);assert.match(s,/await addQuote\(/);for(const source of [q,o,s])assert.match(source,/<fieldset disabled=\{\w+Pending\} aria-busy=/);
});

for (const outcome of ['success','failure','conflict']) test(`order editor ${outcome}: await, double submit, close only on confirmation`,async()=>{
  const wait=deferred(),events=[];let count=0;
  const api=await declarations('../src/app/(dashboard)/orders/page.tsx',['handleSaveEditOrder'],{
    orderMutationRef:{current:false},setOrderPending:v=>events.push(['pending',v]),editingOrder:order,editItems:[item],editAdditionalServices:[],getAdditionalServicesTotal:()=>0,editShipping:0,editDiscount:0,editDiscountReason:'',editPaid:0,editDeliveryDistanceInput:'0',parseDecimalBR:()=>0,editStatus:'orcamento',editDeadline:'2026-12-01',editNotes:'typed',sanitizeDisplayText:v=>v,buildOrderNotesWithDiscount:v=>v,getPaymentStatusForTotal:()=> 'pendente',recalculateOrderItem:v=>v,editDeliveryType:'retirada',editDeliveryAddress:'',
    updateOrder:value=>{count++;assert.equal(value.updated_at,'v1');return wait.promise;},setEditingOrder:()=>events.push(['close']),handleOpenEditOrder:latest=>events.push(['reload',latest]),showToast:msg=>events.push(['error',msg]),PersistenceMutationError,getPersistenceErrorMessage
  });
  const pending=api.handleSaveEditOrder({preventDefault(){}});await api.handleSaveEditOrder({preventDefault(){}});assert.equal(count,1);assert.deepEqual(events,[['pending',true]]);
  if(outcome==='success')wait.resolve(order);else wait.reject(outcome==='conflict'?new PersistenceMutationError('CONFLICT','Conflito',{...order,updated_at:'v2'}):new Error('private SQL'));
  await pending;assert.equal(events.some(e=>e[0]==='close'),outcome==='success');assert.equal(events.some(e=>e[0]==='reload'),outcome==='conflict');assert.deepEqual(events.at(-1),['pending',false]);
});

for(const outcome of ['success','failure'])test(`Store checkout ${outcome}: cart retained until canonical quote, double submit blocked`,async()=>{
  const wait=deferred(),events=[];let count=0;
  const setters=Object.fromEntries(['setCart','setClientName','setClientPhone','setClientNotes','setDeliveryZipCode','setDeliveryStreet','setDeliveryNumber','setDeliveryNeighborhood','setDeliveryCity','setDeliveryState','setCartOpen','setOrderCompleted'].map(name=>[name,value=>events.push([name,value])]));
  const api=await declarations('../src/app/store/page.tsx',['handleCheckout'],{
    ...setters,checkoutMutationRef:{current:false},setCheckoutPending:value=>events.push(['pending',value]),cart:[{product:{id:'p1',name:'Fixture'},quantity:1,calculatedPrice:10}],clientName:'Fixture',clientPhone:'71999999999',deliveryMethod:'retirada',clientNotes:'typed',storeCustomerAuthenticated:true,storeCustomer:{id:'c1'},selectedPickupPoint:'fixture',getCartTotal:()=>10,formatCurrency:String,
    addQuote:()=>{count++;return wait.promise;},showFeedback:msg=>events.push(['error',msg]),getPersistenceErrorMessage
  });
  const pending=api.handleCheckout({preventDefault(){}});await api.handleCheckout({preventDefault(){}});assert.equal(count,1);assert.deepEqual(events,[['pending',true]]);
  if(outcome==='success')wait.resolve({...quote,number:9009});else wait.reject(new Error('network SQL details'));
  await pending;assert.equal(events.some(e=>e[0]==='setCart'),outcome==='success');assert.equal(events.some(e=>e[0]==='setOrderCompleted'&&e[1]==='9009'),outcome==='success');assert.deepEqual(events.at(-1),['pending',false]);
});

for (const mode of ['cancel','confirm','direct','error','inactive']) test(`PIX canonical href: ${mode}`, async()=>{
  const events=[], guard={current:false}; let resolverCalls=0;
  const api=await declarations('../src/app/(dashboard)/orders/page.tsx',['sendPixWhatsApp'],{
    pixPreparing:guard,session:{access_token:'fixture'},
    resolveOperationalWhatsAppMessage:async()=>{resolverCalls++; if(mode==='error')throw new Error('SQL private'); return {active:mode!=='inactive',confirmBeforeOpen:mode!=='direct',href:'https://wa.me/5571999999999?text=canonical'};},
    showToast:message=>events.push(['toast',message]),
    requestAction:async(options,action)=>{events.push(['dialog',options]);if(mode==='confirm'){action();return true;}return false;},
    window:{open:(...args)=>events.push(['open',...args])},formatOrderDisplayNumber:v=>v,formatCurrency:v=>String(v),getConfirmedPaidAmountForOrder:()=>20
  });
  const pending=api.sendPixWhatsApp({...order,customer_name:'Cliente real',number:'PED-0035',total_amount:100});await api.sendPixWhatsApp(order);await pending;
  assert.equal(resolverCalls,1);assert.equal(guard.current,false);
  assert.equal(events.filter(e=>e[0]==='open').length,['confirm','direct'].includes(mode)?1:0);
  if(mode==='confirm'){const options=events.find(e=>e[0]==='dialog')[1];assert.deepEqual(options.summary,[['Cliente','Cliente real'],['Pedido','PED-0035'],['Saldo pendente','80'],['Destino','WhatsApp do cliente']]);assert.equal(events.find(e=>e[0]==='open')[1],'https://wa.me/5571999999999?text=canonical');}
  if(mode==='error')assert.ok(!JSON.stringify(events).includes('SQL'));
});
