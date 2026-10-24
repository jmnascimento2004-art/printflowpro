import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {billingErrorMessage} from '../src/lib/billing/errors.mjs';
const require=createRequire(import.meta.url),next=require('next/server');
function compile(path,mocks={}){
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8'),module={exports:{}};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 Function('require','exports','module',code)(name=>name==='server-only'?{}:name==='@/lib/billing/errors.mjs'?{billingErrorMessage}:mocks[name]??require(name),module.exports,module);return module.exports;
}
const c='tenant-derived-from-host',cid='f1100000-0000-0000-0000-000000000001',commandId='f1100000-0000-0000-0000-000000000002';
const headers={'origin':'https://store.example.test','content-type':'application/json'};
const request=body=>new next.NextRequest('https://store.example.test/api/store/chat',{method:'POST',headers,body:JSON.stringify(body)});
const blank={conversation:null,messages:[]};
function routeFixture(token='a'.repeat(64)){
 const calls=[];const ctx={companyId:c,token,hash:'b'.repeat(64),client:{from:()=>({select:()=>({eq:()=>({single:async()=>({data:{name:'QA Store'}}),maybeSingle:async()=>({data:null})})})})}};
 const publicLib={chatHeaders:{'Cache-Control':'no-store'},chatCookie:'pf-chat',chatVisitorContext:async(_r,create)=>{calls.push(['context',create]);return ctx;},chatVisitorRead:async(_ctx,action,payload)=>{calls.push(['rpc',action,payload]);return {conversation:{id:cid,status:'waiting'},messages:[]};},setChatCookie:(res,token)=>{calls.push(['cookie',token]);res.cookies.set('pf-chat',token,{httpOnly:true});}};
 const route=compile('src/app/api/store/chat/route.ts',{'@/lib/reviews-server':{boundedBody:async r=>Buffer.from(await r.text()),reviewRate:async(...args)=>calls.push(['rate',...args.slice(1)])},'@/lib/store/store-boundary.server':{requireStoreOrigin:r=>{if(r.headers.get('origin')!==new URL(r.url).origin)throw new Error('Origem inválida.');}},'@/lib/chat/public.server':publicLib,'@/lib/whatsapp/system-message-resolver.server':{resolveStoreChatWhatsAppHandoff:async(...args)=>{calls.push(['canonical-wa',...args]);return {href:'https://wa.me/5581999999999?text=short'};}}});return {route,calls};
}
test('public create uses derived context and explicit payload; forged authority never reaches RPC',async()=>{
 const {route,calls}=routeFixture();const res=await route.POST(request({action:'create',content:'Olá 😊',command_id:commandId,company_id:'forged',customer_id:'forged',sender_type:'agent',assigned_user_id:'forged',product_id:'product'}));
 assert.equal(res.status,200);assert.ok(!calls.some(x=>x[0]==='cookie'));const payload=calls.find(x=>x[0]==='rpc')[2];
 assert.equal(payload.content,'Olá 😊');assert.equal(payload.product_id,'product');for(const key of ['company_id','customer_id','sender_type','assigned_user_id'])assert.ok(!(key in payload));
 assert.ok(calls.some(x=>x[0]==='rate'&&x[1]===`chat-create:${c}`&&x[2]===5));
});
test('public send rejects empty, oversized and missing-id messages before mutation',async()=>{
 for(const patch of [{content:''},{content:'  '},{content:'x'.repeat(2001)},{command_id:'1'},{content:null}]){const {route,calls}=routeFixture();const res=await route.POST(request({action:'send',content:'valid',command_id:commandId,...patch}));assert.equal(res.status,400);assert.ok(!calls.some(x=>x[0]==='rpc'));}
});
test('bootstrap delivers cookie without create; first POST refuses missing bootstrap cookie',async()=>{
 const {route,calls}=routeFixture();const response=await route.GET(new next.NextRequest('https://store.example.test/api/store/chat'));
 assert.equal(response.status,200);assert.ok(calls.some(x=>x[0]==='context'&&x[1]===true));assert.ok(calls.some(x=>x[0]==='cookie'));assert.ok(calls.every(x=>x[0]!=='rpc'||x[1]==='read'));
 const missing=routeFixture(null);assert.equal((await missing.route.POST(request({action:'create',content:'hello',command_id:commandId}))).status,400);assert.ok(!missing.calls.some(x=>x[0]==='rpc'));
});
test('cross-origin public mutations denied; no session created by validation failure',async()=>{
 const {route,calls}=routeFixture();const req=new next.NextRequest('https://store.example.test/api/store/chat',{method:'POST',headers:{...headers,origin:'https://evil.example.test'},body:JSON.stringify({action:'create',content:'valid',command_id:commandId})});
 assert.equal((await route.POST(req)).status,400);assert.equal(calls.length,0);
});
test('WhatsApp handoff authorizes conversation then calls canonical resolver without transcript',async()=>{
 const {route,calls}=routeFixture();const res=await route.POST(request({action:'whatsapp',company_id:'forged',conversation_id:'forged',transcript:'private text'}));assert.equal(res.status,200);assert.deepEqual(calls.find(x=>x[0]==='canonical-wa'),['canonical-wa',c,cid]);assert.equal((await res.json()).href,'https://wa.me/5581999999999?text=short');
 assert.ok(calls.findIndex(x=>x[0]==='rpc')<calls.findIndex(x=>x[0]==='canonical-wa'));
});
test('public session helper hashes random256 token and derives actor and tenant server-side',async()=>{
 let rpcArgs;const client={rpc:async(_name,args)=>{rpcArgs=args;return {data:blank};}};
 const lib=compile('src/lib/chat/public.server.ts',{'@/lib/store/store-boundary.server':{resolveStoreBoundary:async()=>({client,companyId:c})},'@/lib/reviews-server':{reviewActor:async()=> 'verified-actor'}});
 const ctx=await lib.chatVisitorContext(new next.NextRequest('https://store.example.test/api/store/chat?company_id=forged'),true);
 assert.match(ctx.token,/^[0-9a-f]{64}$/);assert.notEqual(ctx.token,ctx.hash);assert.equal(ctx.companyId,c);assert.equal(ctx.actor,'verified-actor');await lib.chatVisitorRead(ctx,'send',{content:'hello'});
 assert.equal(rpcArgs.p_token_hash,ctx.hash);assert.equal(rpcArgs.p_company,c);assert.equal(rpcArgs.p_actor,'verified-actor');assert.ok(!JSON.stringify(rpcArgs).includes(ctx.token));
 const res=next.NextResponse.json({});lib.setChatCookie(res,ctx.token);const cookie=res.headers.get('set-cookie');assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=strict/i);assert.match(cookie,/Path=\/api\/store\/chat/);assert.match(cookie,/Max-Age=604800/);
});
test('invalid cookie cannot be used as token; passive read does not mint new session',async()=>{
 const lib=compile('src/lib/chat/public.server.ts',{'@/lib/store/store-boundary.server':{resolveStoreBoundary:async()=>({client:{},companyId:c})},'@/lib/reviews-server':{reviewActor:async()=>null}});
 const ctx=await lib.chatVisitorContext(new next.NextRequest('https://store.example.test/api/store/chat',{headers:{cookie:'pf-chat=1'}}));assert.equal(ctx.token,null);assert.deepEqual(await lib.chatVisitorRead(ctx),blank);
});
test('message renderer escapes script, HTML and attributes while preserving normal text',()=>{
 const {ChatMessages}=compile('src/components/chat/chat-messages.tsx');const content='<script>alert(1)</script><img src=x onerror="alert(2)"> Olá 😊';
 const html=renderToStaticMarkup(React.createElement(ChatMessages,{messages:[{id:cid,seq:1,sender_type:'visitor',content,created_at:'2026-10-23T12:00:00Z'}]}));
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('Olá 😊'));assert.ok(html.includes('role="log"'));
});
test('SSE subscribes only resolved conversation and never forwards raw service role payload',async()=>{
 let filter,removed=0;let change;const controller=new AbortController();
 const channel={on(_event,options,callback){filter=options.filter;change=callback;return this;},subscribe(callback){queueMicrotask(()=>callback('SUBSCRIBED'));return this;}};
 const ctx={companyId:c,client:{channel:()=>channel,removeChannel:async()=>{removed++;}}};
 const route=compile('src/app/api/store/chat/stream/route.ts',{'@/lib/chat/public.server':{chatHeaders:{},chatVisitorContext:async()=>ctx,chatVisitorRead:async()=>({conversation:{id:cid},messages:[]})},'@/lib/reviews-server':{reviewRate:async()=>{}}});
 const response=await route.GET(new next.NextRequest('https://store.example.test/api/store/chat/stream?conversation=forged',{signal:controller.signal}));assert.equal(response.status,200);assert.equal(filter,`id=eq.${cid}`);
 const reader=response.body.getReader(),first=await reader.read();assert.equal(new TextDecoder().decode(first.value),'event: refresh\ndata: {}\n\n');change({new:{customer_id:'SECRET',content:'PRIVATE'}});const second=await reader.read();assert.ok(!new TextDecoder().decode(second.value).includes('SECRET'));controller.abort();await reader.cancel();assert.equal(removed,1);
});
function handler(path,name,deps){
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8'),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let declaration;
 function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name)declaration=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(declaration);
 const code=ts.transpileModule(`const ${declaration};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 return Function(...Object.keys(deps),code+`;return ${name};`)(...Object.values(deps));
}
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
test('actual admin command discards late A response after selection changes to B',async()=>{
 const wait=deferred(),latest={current:0},writes=[];
 const command=handler('src/app/(dashboard)/attendance/page.tsx','command',{pending:false,setPending:()=>{},setError:()=>{},latest,chatFetch:()=>wait.promise,selected:'A',setData:v=>writes.push(v),setLoadedId:()=>assert.fail('stale identity'),setNotice:()=>assert.fail('stale success'),setText:()=>assert.fail('must preserve B composer'),operation:{current:null},setReply:()=>{},initialReply:{}});
 const request=command('send',{});latest.current++;wait.resolve({messages:['A secret']});await request;assert.deepEqual(writes,[]);
});
test('actual public send discards late transcript after logout/reset generation changes',async()=>{
 const wait=deferred(),generation={current:0},writes=[];
 const send=handler('src/components/chat/store-chat-widget.tsx','send',{pending:false,ready:true,text:'hello',setPending:()=>{},setError:()=>{},generation,sendCommand:{current:{id:commandId,text:'hello'}},chatFetch:()=>wait.promise,data:{conversation:{id:cid}},context:{},setData:v=>writes.push(v),setText:()=>assert.fail('stale composer write')});
 const request=send();generation.current++;wait.resolve({conversation:{id:cid},messages:['old customer secret']});await request;assert.deepEqual(writes,[]);
});
test('actual WhatsApp handoff discards prepared URL after identity changes',async()=>{
 const wait=deferred(),generation={current:0},writes=[];
 const handoff=handler('src/components/chat/store-chat-widget.tsx','prepareHandoff',{pending:false,setPending:()=>{},generation,chatFetch:()=>wait.promise,setHandoff:v=>writes.push(v),setError:()=>{}});
 const request=handoff();generation.current++;wait.resolve({href:'old identity URL'});await request;assert.deepEqual(writes,[]);
});
test('product chat opens with canonical context without navigating away and unmounting widget',()=>{
 const events=[];
 const open=handler('src/app/store/page.tsx','handleProductChat',{activeAdvancedConfigProduct:{id:'canonical-product'},setChatProductId:id=>events.push(['context',id]),setActiveAdvancedConfigProduct:value=>events.push(['modal',value]),window:{dispatchEvent:event=>events.push(['event',event.type,event.detail.productId])},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}});
 open();assert.deepEqual(events,[['context','canonical-product'],['modal',null],['event','store-chat:open','canonical-product']]);
});
test('actual product-route effect does not reopen configurator over chat on background product refresh',()=>{
 const source=readFileSync(new URL('../src/app/store/page.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('store.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let effect;
 function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes('const matchingProduct = products.find'))effect=node.arguments[0].getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(effect);
 const code=ts.transpileModule(`const effect=${effect};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const writes=[],product={id:'p1',slug:'banner',active:true,catalog_active:true};
 const run=(chatProductId,products)=>Function('getProductSlugFromStorePath','pathname','products','chatProductId','setActiveAdvancedConfigProduct',code+';effect();')(()=> 'banner','/store/product/banner',products,chatProductId,value=>writes.push(value));
 run('p1',[product]);run('p1',[{...product}]);assert.deepEqual(writes,[]);run(undefined,[product]);assert.deepEqual(writes,[product]);
});
