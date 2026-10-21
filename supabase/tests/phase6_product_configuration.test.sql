begin;
select plan(18);
insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('56000000-0000-0000-0000-000000000001','authenticated','authenticated','phase6-a@example.test','',now(),'{}','{"name":"Phase6 A","company_name":"Phase6 A"}',now(),now()),
('56000000-0000-0000-0000-000000000002','authenticated','authenticated','phase6-b@example.test','',now(),'{}','{"name":"Phase6 B","company_name":"Phase6 B"}',now(),now());
insert into public.products(id,company_id,name,pricing_type,base_cost,sales_price,active,catalog_active,pricing_details) values
('phase6-a',(select company_id from public.profiles where auth_user_id='56000000-0000-0000-0000-000000000001'),'Phase6 A','unidade',10,20,true,true,'{"legacy_note":"preserve"}'),
('phase6-b',(select company_id from public.profiles where auth_user_id='56000000-0000-0000-0000-000000000002'),'Phase6 B','unidade',10,20,true,true,'{}');
select set_config('request.jwt.claims','{"sub":"56000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.products where id='phase6-b'),0,'published product costs of another tenant remain private');
select is((select count(*)::integer from public.products where id='phase6-a'),1,'own product remains readable');
update public.products set pricing_details=pricing_details || '{"cost_composition":{"version":1,"mode":"composition","components":[{"id":"raw","description":"Material","type":"raw","unit":"m2","quantity":2,"unit_cost":10.125,"active":true}]}}',base_cost=999 where id='phase6-a';
select is((select base_cost from public.products where id='phase6-a'),20.25::numeric,'database derives cost and rejects supplied total authority');
select is((select pricing_details->>'legacy_note' from public.products where id='phase6-a'),'preserve','legacy details survive composition changes');
set constraints all immediate;
select is((select count(*)::integer from public.audit_logs where entity_id='phase6-a' and action='product.price_changed'),1,'cost addition uses one existing audit event');
update public.products set pricing_details=jsonb_set(pricing_details,'{cost_composition,components,0,unit_cost}','12') where id='phase6-a';
select is((select base_cost from public.products where id='phase6-a'),24::numeric,'component edit updates canonical cost');
update public.products set pricing_details=jsonb_set(pricing_details,'{cost_composition,components,0,active}','false') where id='phase6-a';
select is((select base_cost from public.products where id='phase6-a'),0::numeric,'inactive cost excluded');
update public.products set pricing_details=jsonb_set(pricing_details,'{cost_composition,components}','[]') where id='phase6-a';
select is((select base_cost from public.products where id='phase6-a'),0::numeric,'removing components leaves zero composition');
update public.products set pricing_details=jsonb_set(pricing_details,'{cost_composition,mode}','"manual"'),base_cost=15 where id='phase6-a';
select is((select base_cost from public.products where id='phase6-a'),15::numeric,'manual override is explicit');
select throws_ok($$update public.products set pricing_details='{"cost_composition":{"components":[]}}' where id='phase6-a'$$,'23514','Invalid product cost composition','missing version and mode rejected');
select throws_ok($$update public.products set pricing_details='{"cost_composition":{"version":1,"mode":"composition","components":[{"id":"bad","description":"Bad","type":"raw","unit":"un","quantity":-1,"unit_cost":2,"active":true}]}}' where id='phase6-a'$$,'23514','Invalid product cost component','negative cost quantity rejected');
select throws_ok($$update public.products set pricing_details='{"configurator_options":{"custom_fields":[{"id":"x","label":"Select","type":"select","required":true,"options":[]}]}}' where id='phase6-a'$$,'23514','Product field requires options','required select without options rejected');
select lives_ok($$update public.products set pricing_details=pricing_details || '{"configurator_options":{"custom_fields":[{"id":"name","label":"Name","type":"text","required":true}]}}' where id='phase6-a'$$,'typed field saved on tenant product');
select is((select pricing_details #>> '{configurator_options,custom_fields,0,label}' from public.products where id='phase6-a'),'Name','field definition round-trips');
update public.products set base_cost=999 where id='phase6-b';
reset role;
select is((select base_cost from public.products where id='phase6-b'),10::numeric,'cross-tenant mutation has no effect');
select is((select count(*)::integer from public.audit_logs where entity_id='phase6-a' and action='product.price_changed'),6,'each material change emits one audit, no preview log');
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select ok(not has_table_privilege('anon','public.products','select'),'anonymous access cannot disclose internal cost JSON');
reset role;
select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename='products' and policyname='public_store_products_select'),'public base table policy removed');
select * from finish();
rollback;
