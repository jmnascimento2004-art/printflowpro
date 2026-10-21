begin;
select plan(10);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('55000000-0000-0000-0000-000000000001','authenticated','authenticated','phase5-a@example.test','',now(),'{}','{"name":"Phase5 A","company_name":"Phase5 A"}',now(),now()),
('55000000-0000-0000-0000-000000000002','authenticated','authenticated','phase5-b@example.test','',now(),'{}','{"name":"Phase5 B","company_name":"Phase5 B"}',now(),now());

insert into public.customers(id,company_id,name,document,phone,email,address,tags,notes)
values
('phase5-customer-a',(select company_id from public.profiles where auth_user_id='55000000-0000-0000-0000-000000000001'),'Phase5 A','','','','{}',array['VIP'],'internal A'),
('phase5-customer-b',(select company_id from public.profiles where auth_user_id='55000000-0000-0000-0000-000000000002'),'Phase5 B','','','','{}',array['Private B'],'internal B');

select set_config('request.jwt.claims','{"sub":"55000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is((select tags from public.customers where id='phase5-customer-a'),array['VIP'],'own tags are readable');
select is((select count(*)::integer from public.customers where id='phase5-customer-b'),0,'other tenant customer and tags are hidden');
update public.customers set tags=array['VIP','Agência'] where id='phase5-customer-a';
set constraints all immediate;
select is((select tags from public.customers where id='phase5-customer-a'),array['VIP','Agência'],'custom tag applied');
select is((select count(*)::integer from public.audit_logs where entity_id='phase5-customer-a' and action='customer.updated'),1,'tag application emits one canonical update audit');
update public.customers set tags=array['Parceiro','Agência'] where id='phase5-customer-a';
select is((select tags from public.customers where id='phase5-customer-a'),array['Parceiro','Agência'],'tag renamed on customer');
update public.customers set tags=array['Parceiro'] where id='phase5-customer-a';
select is((select tags from public.customers where id='phase5-customer-a'),array['Parceiro'],'one tag removed');
update public.customers set tags='{}' where id='phase5-customer-a';
select is((select tags from public.customers where id='phase5-customer-a'),'{}'::text[],'all tags removed');
select is((select notes from public.customers where id='phase5-customer-a'),'internal A','internal notes preserved by tag changes');
update public.customers set tags=array['Cross tenant'] where id='phase5-customer-b';
reset role;
select is((select tags from public.customers where id='phase5-customer-b'),array['Private B'],'cross-tenant update has no effect');
select is((select count(*)::integer from public.audit_logs where entity_id='phase5-customer-a' and action='customer.updated'),4,'each relevant tag edit has exactly one audit event');
select * from finish();
rollback;
