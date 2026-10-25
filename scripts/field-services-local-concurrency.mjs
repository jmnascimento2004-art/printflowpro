// Local-only validation: clone the running Supabase database into a temporary database,
// replay this phase's exact migration from a clean phase scope, test races, drop the clone.
import {spawn} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const container='supabase_db_PrintFlowPRO',database='phase11i_validation_20261025',dump='/tmp/phase11i-validation.dump';
if(process.argv[2]!=='--local-clone')throw new Error('Use --local-clone to explicitly enable this local temporary database test.');
function run(args,input=''){return new Promise(resolve=>{const child=spawn('docker',['exec','-i',container,...args],{stdio:['pipe','pipe','pipe']}),out=[],err=[];child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));child.on('error',e=>resolve({code:-1,out:'',err:e.message}));child.on('close',code=>resolve({code,out:Buffer.concat(out).toString().trim(),err:Buffer.concat(err).toString().trim()}));child.stdin.end(input);});}
async function checked(args,input=''){const r=await run(args,input);assert.equal(r.code,0,r.err||r.out);return r.out;}
function sql(text){return run(['psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-Atq'],text);}
async function query(text){const r=await sql(text);assert.equal(r.code,0,r.err||r.out);return r.out;}
const user='b119c000-0000-4000-8000-000000000001',claims=JSON.stringify({sub:user,role:'authenticated'}),serviceClaims=JSON.stringify({sub:user,role:'service_role'}),quote=s=>`'${String(s).replaceAll("'","''")}'`;
function context(body,serviceRole=false){return `begin;set local request.jwt.claims=${quote(serviceRole?serviceClaims:claims)};set local role ${serviceRole?'service_role':'authenticated'};${body};commit;`;}
async function command(id,action,patch={},nonce=randomUUID()){return query(context(`select public.field_service_command(${quote(nonce)},${quote(action)},(select jsonb_build_object('id',id,'updated_at',updated_at) from public.field_services where id=${quote(id)})||${quote(JSON.stringify(patch))}::jsonb)`));}
let created=false,wroteDump=false;
try{
 const exists=await checked(['psql','-U','postgres','-d','postgres','-Atq','-c',`select count(*) from pg_database where datname=${quote(database)}`]);assert.equal(exists,'0','temporary validation database already exists; inspect it rather than overwrite');
 await checked(['pg_dump','-U','postgres','-d','postgres','-Fc','-f',dump]);wroteDump=true;
 await checked(['createdb','-U','postgres',database]);created=true;
 // Preserve owners and ACLs using the local cluster's administrative role.
 await checked(['pg_restore','-U','supabase_admin','-d',database,'--exit-on-error',dump]);
 assert.equal(await query('select current_database()'),database);
 // Only the cloned phase objects are replaced. The source database is never reset or restored.
 await query(`begin;do $$declare r record;begin for r in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='private' and p.proname like 'fs_%') or (n.nspname='public' and p.proname like 'field_service_%') loop execute format('drop function if exists %I.%I(%s) cascade',r.nspname,r.proname,r.args);end loop;end$$;
 drop table public.field_service_events,public.field_service_completions,public.field_service_evidence,public.field_service_costs,public.field_service_materials,public.field_service_templates,public.field_services cascade;
 drop table private.field_service_commands,private.field_service_counters;
 set local storage.allow_delete_query='true';delete from storage.buckets where id='field-service-evidence';commit;`);
 const migrations=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(name=>/_phase11i_(field_services|assignee_fk_index)\.sql$/.test(name)).sort();assert.equal(migrations.length,2);for(const name of migrations){const migration=readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');await query(`begin;${migration};commit;`);}console.log('PASS exact additive migrations in isolated clone');
 const setup=`begin;insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('${user}','authenticated','authenticated','field-concurrency@example.test','',now(),'{}','{"name":"Field Concurrent QA","company_name":"Field Concurrent QA"}',now(),now());set local request.jwt.claims=${quote(claims)};
 insert into public.customers(id,company_id,name,document,phone,email,address,tags,notes) values('ic-customer',private.current_company_id(),'Cliente concorrência QA','','81900000000','','{"street":"Rua QA","number":"1","city":"Recife","state":"PE"}','{}','QA');
 insert into public.products(id,company_id,name,pricing_type,base_cost,sales_price,stock_controlled,current_stock,min_stock) values('ic-material',private.current_company_id(),'Material concorrência QA','unidade',2,5,true,3,0);
 insert into public.orders(id,company_id,customer_id,customer_name,number,status,total_amount,paid_amount,payment_status,shipping_cost,notes) values('ic-order',private.current_company_id(),'ic-customer','Cliente concorrência QA','PED-119C','expedicao',100,0,'pendente',0,'QA');insert into public.order_items(id,order_id,product_name,quantity,unit_price,total_price,details) values('ic-item','ic-order','Item concorrência QA',1,100,100,'{}');
 do $$declare kind text;s public.field_services%rowtype;r jsonb;target text;begin foreach kind in array array['measurement','visit','maintenance','return','technical_delivery'] loop
 r:=public.field_service_command(gen_random_uuid(),'save',jsonb_build_object('order_id','ic-order','order_item_id','ic-item','service_type',kind,'title','Concorrência QA '||kind,'assigned_profile_id',(select id from public.profiles where auth_user_id=auth.uid()),'team','[]'::jsonb,'address','{"street":"Rua QA","number":"1","city":"Recife","state":"PE"}'::jsonb,'checklist','[]'::jsonb));
 if kind in('measurement','visit') then select * into s from public.field_services where id=(r->>'id')::uuid;perform public.field_service_command(gen_random_uuid(),'schedule',jsonb_build_object('id',s.id,'updated_at',s.updated_at,'start',now(),'end',now()+interval '1 hour'));
 foreach target in array array['traveling','on_site','running'] loop select * into s from public.field_services where id=s.id;perform public.field_service_command(gen_random_uuid(),'transition',jsonb_build_object('id',s.id,'updated_at',s.updated_at,'status',target));end loop;end if;end loop;end$$;commit;
 select jsonb_object_agg(service_type,jsonb_build_object('id',id,'updated_at',updated_at)) from public.field_services where order_id='ic-order';`;
 const services=JSON.parse(await query(setup));
 const race=async(kind,sameNonce)=>{const s=services[kind],nonce=randomUUID(),payload=quote(JSON.stringify({id:s.id,updated_at:s.updated_at,note:'Conclusão concorrente QA'})),make=n=>context(`select public.field_service_command(${quote(n)},'complete',${payload}::jsonb)`),results=await Promise.all([sql(make(nonce)),sql(make(sameNonce?nonce:randomUUID()))]);assert.equal(results.filter(r=>r.code===0).length,sameNonce?2:1,JSON.stringify(results));if(!sameNonce)assert.match(results.find(r=>r.code!==0).err,/Serviço mudou/);assert.equal(await query(`select count(*) from public.field_service_completions where service_id=${quote(s.id)}`),'1');assert.equal(await query(`select count(*) from public.field_service_events where service_id=${quote(s.id)} and action='completed'`),'1');};
 await race('measurement',false);console.log('PASS simultaneous completion: one commit, one stale-version rejection');
 await race('visit',true);console.log('PASS simultaneous identical nonce: two receipts, one conclusion and audit');
 for(const kind of ['maintenance','return'])await command(services[kind].id,'material_add',{product_id:'ic-material',quantity:2});
 const take=async kind=>{const id=services[kind].id,version=JSON.parse(await query(`select jsonb_build_object('id',id,'updated_at',updated_at,'material_id',(select id from public.field_service_materials where service_id=s.id),'quantity',2) from public.field_services s where id=${quote(id)}`));return sql(context(`select public.field_service_command(${quote(randomUUID())},'material_take',${quote(JSON.stringify(version))}::jsonb)`));};
 const taken=await Promise.all([take('maintenance'),take('return')]);assert.equal(taken.filter(r=>r.code===0).length,1,JSON.stringify(taken));assert.equal(await query("select current_stock from public.products where id='ic-material'"),'1.000000');assert.equal(await query("select count(*) from public.stock_movements where product_id='ic-material' and type='saida'"),'1');console.log('PASS two services share one stock balance without negative or duplicate consumption');
 const imageService=services.technical_delivery.id;
 async function photo(char){const result=JSON.parse(await command(imageService,'file_reserve',{kind:'after',sha256:char.repeat(64),bytes:100,mime:'image/jpeg',caption:'Evidência concorrente QA'}));await query(`insert into storage.objects(bucket_id,name) values('field-service-evidence',${quote(result.file.path)})`);return result.file;}
 const first=await photo('a'),commit=file=>sql(context(`select public.field_service_commit_upload(${quote(file.id)},'${user}',${quote(file.sha256)},100)`,true));
 const finalized=await Promise.all([commit(first),commit(first)]);assert.ok(finalized.every(r=>r.code===0),JSON.stringify(finalized));assert.equal(await query(`select count(*) from public.field_service_events where service_id=${quote(imageService)} and action='evidence_added'`),'1');console.log('PASS simultaneous upload finalization audits once');
 const second=await photo('b'),base=JSON.parse(await query(`select jsonb_build_object('id',id,'updated_at',updated_at,'evidence_id',${quote(second.id)},'reason','Remoção concorrente QA') from public.field_services where id=${quote(imageService)}`));
 // Signal only after removal owns the canonical locks. Process startup timing must
 // not let finalization win before the intended delayed-finalization scenario.
 const removed=sql(context(`select public.field_service_command(${quote(randomUUID())},'file_remove',${quote(JSON.stringify(base))}::jsonb);select pg_advisory_xact_lock(119119);select pg_sleep(2)`));
 let barrier=false;for(let attempt=0;attempt<20&&!barrier;attempt++)barrier=await query("select exists(select 1 from pg_locks where locktype='advisory' and objid=119119 and granted)")==='t';assert.ok(barrier,'removal lock barrier reached');
 const lateCommit=sql(context(`select public.field_service_commit_upload(${quote(second.id)},'${user}',${quote(second.sha256)},100)`,true)),r=await Promise.all([removed,lateCommit]);assert.equal(r[0].code,0,r[0].err);assert.notEqual(r[1].code,0);assert.equal(await query(`select state from public.field_service_evidence where id=${quote(second.id)}`),'removed');console.log('PASS removal and delayed finalization cannot resurrect evidence');
 console.log('PASS 6 isolated migration/concurrency scenarios');
}finally{
 if(created){assert.equal(database,'phase11i_validation_20261025');await checked(['dropdb','-U','postgres',database]);console.log('Temporary clone dropped; source database unchanged.');}
 if(wroteDump)await checked(['rm','-f',dump]);
}
