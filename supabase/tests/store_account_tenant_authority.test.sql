begin;
select no_plan();

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
values
 ('47000000-0000-0000-0000-000000000001','authenticated','authenticated','authority-owner@example.test',now(),'{"name":"Authority A","company_name":"Authority A"}'),
 ('47000000-0000-0000-0000-000000000002','authenticated','authenticated','authority-attacker@example.test',now(),'{"name":"Authority B","company_name":"Authority B"}');
update public.companies set store_domain = 'authority-a.example.test'
where id = (select company_id from public.profiles where auth_user_id='47000000-0000-0000-0000-000000000001');
update public.companies set store_domain = 'authority-b.example.test'
where id = (select company_id from public.profiles where auth_user_id='47000000-0000-0000-0000-000000000002');
insert into public.customers(id,company_id,name,document,email,phone,address,tags,notes)
select 'authority-customer-' || label, company_id, 'Authority Fixture', '12345678901', 'authority-owner@example.test', '', '{}', '{}', ''
from (values ('a','47000000-0000-0000-0000-000000000001'::uuid),('b','47000000-0000-0000-0000-000000000002'::uuid)) f(label,actor)
join public.profiles p on p.auth_user_id=f.actor;

select function_privs_are('public','ensure_store_customer_account_from_server',array['text','uuid','jsonb'],'authenticated',array[]::text[]);
select function_privs_are('public','ensure_store_customer_account_from_server',array['text','uuid','jsonb'],'anon',array[]::text[]);
select function_privs_are('public','ensure_store_customer_account_from_server',array['text','uuid','jsonb'],'public',array[]::text[]);
select function_privs_are('public','ensure_store_customer_account_from_server',array['text','uuid','jsonb'],'service_role',array['EXECUTE']);
select is((select proconfig from pg_proc where oid='public.ensure_store_customer_account_from_server(text,uuid,jsonb)'::regprocedure),array['search_path=""']::text[],'server wrapper pins search_path');

select set_config('request.jwt.claims','{"role":"authenticated","sub":"47000000-0000-0000-0000-000000000001"}',true);
select set_config('request.headers','{"origin":"http://localhost:3000","x-forwarded-host":"authority-b.example.test"}',true);
set local role authenticated;
select throws_ok($q$select * from public.ensure_store_customer_account_from_server('authority-b.example.test','47000000-0000-0000-0000-000000000001','{}')$q$,'42501',null,'direct wrapper call denied despite spoofed headers');
select throws_ok($q$select * from public.ensure_store_customer_account('arbitrary-company','Attacker','fisica','12345678901','71999999999')$q$,'42501',null,'legacy direct path denied despite localhost Origin');
reset role;

select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select throws_ok($q$select * from public.ensure_store_customer_account_from_server(null,'47000000-0000-0000-0000-000000000001','{}')$q$,'P0001','Nao foi possivel concluir o cadastro.','missing canonical host rejected');
select throws_ok($q$select * from public.ensure_store_customer_account_from_server('localhost','47000000-0000-0000-0000-000000000001','{}')$q$,'P0001','Nao foi possivel concluir o cadastro.','localhost cannot be DB authority');
select throws_ok($q$select * from public.ensure_store_customer_account_from_server('unknown.example.test','47000000-0000-0000-0000-000000000001','{}')$q$,'P0001','Nao foi possivel concluir o cadastro.','unmapped host rejected');
select throws_ok($q$select * from public.ensure_store_customer_account_from_server('authority-a.example.test',null,'{}')$q$,'P0001','Nao foi possivel concluir o cadastro.','missing actor rejected');
select throws_ok($q$select * from public.ensure_store_customer_account_from_server('authority-a.example.test','47000000-0000-0000-0000-000000000001','{"p_company_id":"tenant-b"}')$q$,'P0001','Nao foi possivel concluir o cadastro.','payload company override rejected');
select throws_ok($q$select * from public.ensure_store_customer_account_from_server('authority-a.example.test','47000000-0000-0000-0000-000000000002','{"p_name":"Attacker","p_document":"12345678901"}')$q$,'P0001','Nao foi possivel concluir o cadastro.','known document plus different verified email is rejected');
reset role;
select is((select auth_user_id from public.customers where id='authority-customer-a'),null::uuid,'rejected attempt preserves customer');

-- The server supplied Host A is authoritative despite conflicting raw headers B.
select set_config('request.headers','{"host":"authority-a.example.test","origin":"https://authority-b.example.test","referer":"https://authority-b.example.test","x-forwarded-host":"authority-b.example.test"}',true);
set local role service_role;
select lives_ok($q$select * from public.ensure_store_customer_account_from_server('authority-a.example.test','47000000-0000-0000-0000-000000000001','{"p_name":"Owner","p_customer_type":"fisica","p_document":"12345678901","p_phone":"71999999999"}')$q$,'canonical host A ignores raw headers B');
select is(auth.uid(),null::uuid,'actor context restored after wrapper');
select is(current_setting('request.jwt.claims')::jsonb->>'role','service_role','original role claim restored');
reset role;
select is((select auth_user_id from public.customers where id='authority-customer-a'),'47000000-0000-0000-0000-000000000001'::uuid,'only tenant A customer linked');
select is((select auth_user_id from public.customers where id='authority-customer-b'),null::uuid,'matching email in B remains untouched');
select is((select count(*)::int from public.store_customer_accounts where customer_id='authority-customer-b'),0,'no B Store account created');
select is((select count(*)::int from public.audit_logs where entity_id='authority-customer-a' and action='customer.store_account_linked'),1,'link audit emitted once');

set local role service_role;
select lives_ok($q$select * from public.ensure_store_customer_account_from_server('authority-a.example.test','47000000-0000-0000-0000-000000000001','{"p_name":"Owner","p_document":"12345678901"}')$q$,'same actor retry is idempotent');
select throws_ok($q$select * from public.ensure_store_customer_account_from_server('authority-a.example.test','47000000-0000-0000-0000-000000000002','{"p_name":"Attacker","p_document":"12345678901"}')$q$,'P0001','Nao foi possivel concluir o cadastro.','other actor cannot overwrite linked owner');
select lives_ok($q$select * from public.ensure_store_customer_account_from_server('authority-a.example.test','47000000-0000-0000-0000-000000000002','{"p_name":"New customer","p_document":"98765432109"}')$q$,'legitimate new customer onboarding works');
reset role;
select is((select count(*)::int from public.audit_logs where entity_id='authority-customer-a' and action='customer.store_account_linked'),1,'retry does not duplicate audit');
select is((select auth_user_id from public.customers where id='authority-customer-a'),'47000000-0000-0000-0000-000000000001'::uuid,'owner remains intact after retry/attacker');
select set_config('request.jwt.claim.sub','47000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"role":"service_role","marker":"restore-exactly"}',true);
select set_config('request.headers','{"origin":"https://authority-b.example.test","x-forwarded-host":"authority-b.example.test","marker":"restore-exactly"}',true);
set local role service_role;
select throws_ok($q$select * from public.ensure_store_customer_account_from_server('authority-a.example.test','47000000-0000-0000-0000-000000000002','{"p_name":"Attacker","p_document":"12345678901"}')$q$,'P0001','Nao foi possivel concluir o cadastro.','core ownership exception rolls back wrapper context');
select is(current_setting('request.jwt.claim.sub'),'47000000-0000-0000-0000-000000000002','sub restored exactly after core error');
select is(current_setting('request.jwt.claims'),'{"role":"service_role","marker":"restore-exactly"}','claims restored exactly after core error');
select is(current_setting('request.headers'),'{"origin":"https://authority-b.example.test","x-forwarded-host":"authority-b.example.test","marker":"restore-exactly"}','headers restored exactly after core error');
select lives_ok($q$select * from public.ensure_store_customer_account_from_server('authority-a.example.test','47000000-0000-0000-0000-000000000001','{"p_name":"Owner"}')$q$,'success with original nonempty sub');
select is(current_setting('request.jwt.claim.sub'),'47000000-0000-0000-0000-000000000002','sub restored exactly after success');
select is(current_setting('request.jwt.claims'),'{"role":"service_role","marker":"restore-exactly"}','claims restored exactly after success');
select is(current_setting('request.headers'),'{"origin":"https://authority-b.example.test","x-forwarded-host":"authority-b.example.test","marker":"restore-exactly"}','headers restored exactly after success');
reset role;
update public.companies set custom_domain='authority-a.example.test'
where store_domain='authority-b.example.test';
set local role service_role;
select throws_ok($q$select * from public.ensure_store_customer_account_from_server('authority-a.example.test','47000000-0000-0000-0000-000000000001','{"p_name":"Owner"}')$q$,'P0001','Nao foi possivel concluir o cadastro.','domain ambiguity across company columns fails closed');
reset role;
select * from finish();
rollback;
