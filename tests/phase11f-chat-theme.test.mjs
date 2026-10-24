import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function compile(path,mocks={}){
 const module={exports:{}},code=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 Function('require','exports','module',code)(name=>mocks[name]??require(name),module.exports,module);return module.exports;
}
const helper=compile('src/lib/store/catalog-visual-settings.ts');
function rgb(hex){return hex.replace('#','').match(/../g).map(x=>parseInt(x,16));}
function luminance(values){const channels=values.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;}
function ratio(a,b){a=luminance(a);b=luminance(b);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
function hslRgb(value){let [h,s,l]=value.match(/[\d.]+/g).map(Number);h/=360;s/=100;l/=100;const f=n=>{const k=(n+h*12)%12;return 255*(l-s*Math.min(l,1-l)*Math.max(-1,Math.min(k-3,9-k,1)));};return [f(0),f(8),f(4)];}
test('canonical foreground helper meets AA across light, dark, presets and mid-tone brand colors',()=>{
 for(let r=0;r<=255;r+=15)for(let g=0;g<=255;g+=15)for(let b=0;b<=255;b+=15){const hex='#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');assert.ok(ratio([r,g,b],rgb(helper.getContrastingTextColor(hex)))>=4.5,hex);}
 assert.equal(helper.getContrastingTextColor('#fff'),'#0f172a');assert.equal(helper.getContrastingTextColor('#111827'),'#ffffff');
});
function syncFixture(){
 const properties=new Map(),effects=[];let company={theme_color:'#1d35c9'};
 const component=compile('src/components/company-theme-sync.tsx',{'react':{useEffect:fn=>effects.push(fn)},'next/navigation':{usePathname:()=>'/store/product/qa',useRouter:()=>({replace:()=>{}})},'@/context/database-context':{useDatabase:()=>({company})},'@/lib/store/catalog-visual-settings':helper});
 const documentMock={documentElement:{style:{setProperty:(key,value)=>properties.set(key,value)}}};
 const windowMock={location:{hostname:'qa.example.test'}};
 return {properties,run(color){company={theme_color:color};effects.length=0;component.CompanyThemeSync();const oldDocument=globalThis.document,oldWindow=globalThis.window;try{globalThis.document=documentMock;globalThis.window=windowMock;effects.forEach(fn=>fn());}finally{globalThis.document=oldDocument;globalThis.window=oldWindow;}return Object.fromEntries(properties);}};
}
test('actual theme sync updates tenant A→B→A with AA foreground, ring and official fallback; no stale tenant color',()=>{
 const sync=syncFixture(),a=sync.run('#ffee88'),b=sync.run('#102040');assert.notEqual(a['--primary'],b['--primary']);assert.notEqual(a['--primary-foreground'],b['--primary-foreground']);assert.deepEqual(sync.run('#ffee88'),a);
 for(const color of ['#059669','#2563eb','#5b3df4','#d97706','#e11d48','#808080','#ffff00','#000000','#ffffff','#0087c8','#008ca5','#008caa']){const tokens=sync.run(color);assert.ok(ratio(hslRgb(tokens['--primary']),hslRgb(tokens['--primary-foreground']))>=4.5,color);assert.equal(tokens['--ring'],tokens['--primary']);}
 for(let r=0;r<=255;r+=15)for(let g=0;g<=255;g+=15)for(let b=0;b<=255;b+=15){const color='#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join(''),tokens=sync.run(color);assert.ok(ratio(hslRgb(tokens['--primary']),hslRgb(tokens['--primary-foreground']))>=4.5,color);}
 assert.deepEqual(sync.run(null),sync.run('violet'));assert.deepEqual(sync.run('not-a-color'),sync.run('violet'));
});
test('chat identity has no private palette or duplicate theme setting; warning/error semantics remain allowed',()=>{
 for(const path of ['src/components/chat/store-chat-widget.tsx','src/components/chat/chat-messages.tsx','src/components/chat/chat-unread-badge.tsx','src/app/(dashboard)/attendance/page.tsx']){
  const source=read(path);assert.doesNotMatch(source,/(?:bg|text|border|ring)-(?:blue|indigo|violet|purple|green|emerald|teal)-|#[a-f\d]{3,8}\b|\brgba?\(|\bhsla?\(|chat(?:Primary|Header|Button)Color|text-white|bg-white|text-slate-|bg-slate-/i,path);
  assert.match(source,/bg-primary/);assert.match(source,/text-primary-foreground/);
 }
});
test('header, composer, selected filters, bubbles and shared controls use canonical theme and dark neutrals',()=>{
 const widget=read('src/components/chat/store-chat-widget.tsx'),admin=read('src/app/(dashboard)/attendance/page.tsx'),messages=read('src/components/chat/chat-messages.tsx'),css=read('src/app/globals.css');
 assert.match(widget,/<header className="[^"]*bg-primary[^\"]*text-primary-foreground/);assert.doesNotMatch(widget,/const primary=|backgroundColor:primary/);
 assert.match(widget,/className="pf-textarea /);assert.match(widget,/aria-label="Enviar mensagem" className="[^"]*pf-button-primary/);assert.match(widget,/shrink-0 rounded-lg p-2/);
 assert.match(admin,/filter===key\?'border-primary bg-primary text-primary-foreground'/);assert.match(admin,/selected===c.id\?'bg-primary\/10 text-foreground'/);
 assert.match(messages,/m.sender_type!=='agent'\?'bg-primary text-primary-foreground/);assert.match(messages,/bg-muted text-muted-foreground/);assert.doesNotMatch(messages,/opacity-/);
 assert.match(css,/\.pf-button-primary\s*\{[^}]*text-primary-foreground/);assert.match(css,/\.pf-textarea\s*\{[^}]*focus:border-primary[^}]*focus:ring-primary\/15[^}]*dark:bg-card/);
 assert.match(widget,/outline-foreground/);assert.match(widget,/focus-visible:!outline-primary-foreground/);
 assert.match(widget,/text-red-700 dark:text-red-300/);assert.ok(ratio(rgb('#fca5a5'),[10,14,26])>=4.5);
 assert.match(css,/\.pf-textarea\s*\{[^}]*focus-visible:outline-foreground/);assert.doesNotMatch(css.match(/\.pf-button-primary\s*\{[^}]+/)[0],/brightness-|hover:bg-primary\//);
});
