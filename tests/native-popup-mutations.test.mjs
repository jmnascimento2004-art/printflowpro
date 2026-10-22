import assert from 'node:assert/strict';
import test from 'node:test';
import {extractHandler} from './helpers/extract-handler.mjs';
const context='src/context/database-context.tsx';
for(const [name,collection,setter]of [['deleteCustomer','customers','setCustomers'],['deleteCategory','categories','setCategories'],['deleteProduct','products','setProducts'],['deletePickupPoint','pickupPoints','setPickupPoints'],['deleteBanner','banners','setBanners']])for(const outcome of ['success','failure'])test(`${name}: awaits confirmation, returns outcome and preserves rollback (${outcome})`,async()=>{
 let rows=[{id:'x',company_id:'tenant',updated_at:'v1'}],resolve,reject,calls=0;const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
 const command=(...args)=>{calls++;if(name!=='deleteCustomer'){assert.equal(args[2],'tenant');assert.equal(args[3].expectedUpdatedAt,'v1');}return pending;};
 const handler=await extractHandler(context,name,{[collection]:rows,[setter]:value=>{rows=typeof value==='function'?value(rows):value;},currentCompanyId:'tenant',deleteTenantRecord:command,deleteCustomerRecord:command,persistDemoSnapshot(){},warnCaught(){},showToast(){},canShowToast:true});
 let done=false;const operation=handler('x').then(value=>{done=true;return value;});assert.equal(calls,1);assert.equal(done,false);assert.equal(rows.length,0);
 if(outcome==='success')resolve();else reject(new Error('private SQL'));
 assert.equal(await operation,outcome==='success');assert.equal(rows.length,outcome==='success'?0:1);
});
for(const outcome of ['success','denied','zero'])test(`employee deletion: confirmed affected row required (${outcome})`,async()=>{
 let rows=[{id:'x'}];const query={delete(){return this;},eq(){return this;},select(){return this;},async maybeSingle(){return {data:outcome==='success'?{id:'x'}:null,error:outcome==='denied'?new Error('private'):null};}};
 const handler=await extractHandler(context,'deleteProfile',{profiles:rows,setProfiles:fn=>{rows=fn(rows);},supabase:{from:()=>query},warnCaught(){}});
 assert.equal(await handler('x'),outcome==='success');assert.equal(rows.length,outcome==='success'?0:1);
});
for(const failure of [false,true])test(`reset feedback: no reload or snapshot cleanup on response error (${failure})`,async()=>{
 let reload=0,clear=0;const query={delete(){return this;},not(){return Promise.resolve({error:failure?{message:'denied'}:null});}};
 const handler=await extractHandler(context,'resetDatabase',{isBrowser:()=>true,deleteAllCustomers:async()=>{},supabase:{from:()=>query},clearOperationalDemoSnapshots:()=>clear++,window:{location:{reload:()=>reload++}},warnCaught(){}});
 assert.equal(await handler(),!failure);assert.equal(reload,failure?0:1);assert.equal(clear,failure?0:1);
});
