import test from 'node:test';
import assert from 'node:assert/strict';
import {REAL_BILLING_ENABLED,assertBillingQa,signBillingEvent,parseBillingEvent,mockBillingAdapter} from '../src/lib/billing/provider.mjs';
import {billingErrorMessage} from '../src/lib/billing/errors.mjs';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const secret='synthetic-billing-test-secret-'.repeat(3),timestamp='1792796400',now=Number(timestamp)*1000;
const event={command_id:'e1100000-0000-0000-0000-000000000001',event_id:'mock-billing:e1100000-0000-0000-0000-000000000001',sequence:1,state:'confirmed_qa'};
const parse=(v=event,t=timestamp,s=secret)=>{const body=JSON.stringify(v);return parseBillingEvent(body,t,signBillingEvent(body,t,s),secret,now);};
test('quota and read-only feedback preserve controlled messages without leaking diagnostics',()=>{
 const message='Billing: Limite de 2 produtos do plano atingido. Consulte Plano e Assinatura.';
 assert.equal(billingErrorMessage({code:'42501',message}),message);
 const conflict='Billing: Operação concorrente. Atualize e tente novamente.';
 assert.equal(billingErrorMessage({code:'40001',message:conflict}),conflict);
 for(const value of [{code:'42501',message:'Billing: SELECT secret'},{code:'42501',message:message+' secret'},{code:'23505',message},{code:'42501',message:'Billing: Limite de <script> produtos'},null,{}])assert.equal(billingErrorMessage(value),null);
});
test('actual product save handler propagates third-product quota without optimistic success',async()=>{
 const source=await readFile(new URL('../src/lib/persistence/persistence-service.ts',import.meta.url),'utf8'),module={exports:{}};
 Function('require','exports','module',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name==='@/lib/billing/errors.mjs'?{billingErrorMessage}:{supabase:{}},module.exports,module);
 const context=await readFile(new URL('../src/context/database-context.tsx',import.meta.url),'utf8');
 const ast=ts.createSourceFile('context.tsx',context,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let declaration;
 function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='saveProduct')declaration=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(declaration);
 const code=ts.transpileModule(`const ${declaration};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const message='Billing: Limite de 2 produtos do plano atingido. Consulte Plano e Assinatura.';let successWrites=0;
 const client={from:()=>({insert:()=>({select:()=>({single:async()=>({data:null,error:{code:'42501',message}})})})})};
 const handler=Function('loadGenerationRef','currentCompanyId','insertTenantRecord','patchTenantRecord','setProducts',code+';return saveProduct;')({current:1},'qa-company',(table,row)=>module.exports.insertTenantRecord(table,row,client),()=>assert.fail('unexpected update'),()=>successWrites++);
 await assert.rejects(handler({name:'Third synthetic product'}),error=>error.message===message&&error.code==='NOT_AUTHORIZED');
 assert.equal(successWrites,0);
});
test('real SaaS billing is hard disabled; every real mode fails',()=>{
 assert.equal(REAL_BILLING_ENABLED,false);assert.doesNotThrow(()=>assertBillingQa({provider:'mock',environment:'qa',real_billing_enabled:false}));
 for(const v of [{provider:'stripe'},{environment:'production'},{real_billing_enabled:true},{real_billing_enabled:'false'},{provider:null}])assert.throws(()=>assertBillingQa(v),/SAAS_REAL_BILLING_REQUIRES_EXPLICIT_AUTHORIZATION/);
});
test('valid signed mock callback and all adapter actions produce the same bounded event',async()=>{
 assert.deepEqual(parse(),event);
 for(const action of ['createSubscription','changePlan','cancelSubscription','getSubscription'])assert.deepEqual(await mockBillingAdapter[action]({command_id:event.command_id,revision:1}),event);
 assert.deepEqual(await mockBillingAdapter.createCustomer({environment:'qa'}),{id:'mock-qa',qa:true});
});
test('forged, expired, future, changed and malformed signatures fail',()=>{
 assert.throws(()=>parse(event,timestamp,'forged-secret-with-sufficient-length'));
 for(const t of [String(Number(timestamp)-301),String(Number(timestamp)+301),'','123',null])assert.throws(()=>parse(event,t));
 const body=JSON.stringify(event);for(const sig of ['','a'.repeat(63),'z'.repeat(64),null])assert.throws(()=>parseBillingEvent(body,timestamp,sig,secret,now));
 assert.throws(()=>parseBillingEvent(body+' ',timestamp,signBillingEvent(body,timestamp,secret),secret,now));
});
test('callback schema rejects authority fields, money, unexpected state and identity substitutions',()=>{
 for(const patch of [{price:0},{company_id:'other'},{plan_id:'free'},{features:{}},{state:'active'},{state:'confirmed_real'},{sequence:0},{sequence:1.5},{sequence:1000001},{sequence:'1'},{command_id:'other'},{event_id:'reused'}])assert.throws(()=>parse({...event,...patch}));
 for(const key of Object.keys(event)){const v={...event};delete v[key];assert.throws(()=>parse(v));}
 for(const v of [null,[],42,'text'])assert.throws(()=>parse(v));
});
test('oversized, invalid JSON and missing secret are denied',()=>{
 for(const body of ['{','x'.repeat(2049)])assert.throws(()=>parseBillingEvent(body,timestamp,signBillingEvent(body,timestamp,secret),secret,now));
 assert.throws(()=>parseBillingEvent(JSON.stringify(event),timestamp,'a'.repeat(64),'short',now));
});
