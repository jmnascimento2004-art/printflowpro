begin;
select plan(3);
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('59000000-0000-0000-0000-000000000099','authenticated','authenticated','phase9-performance@example.test','',now(),'{}','{"name":"Phase9 performance","company_name":"Phase9 performance"}',now(),now());
select set_config('request.jwt.claims','{"sub":"59000000-0000-0000-0000-000000000099","role":"authenticated"}',true);
select set_config('phase9.account',private.finance_default_account(private.current_company_id(),false)::text,true);
insert into public.orders(id,company_id,customer_name,number,status,total_amount,created_at)
select 'phase9-perf-order-'||n,private.current_company_id(),'Performance','PED-'||n,'producao',1,'2026-10-15T12:00Z' from generate_series(1,5000) n;
insert into public.financial_transactions(company_id,account_id,order_id,type,category,amount,payment_method,status,due_date,paid_at)
select private.current_company_id(),current_setting('phase9.account')::uuid,'phase9-perf-order-'||n,'receita','Performance',1,'pix','pago','2026-10-15','2026-10-15T12:00Z' from generate_series(1,5000) n;
set local role authenticated;
explain (analyze,buffers) select public.reports_source('finance','2026-10-01','2026-10-31');
select is((public.reports_source('finance','2026-10-01','2026-10-31')#>>'{summary,result}')::numeric,5000::numeric,'5000 ledger receipts aggregate completely');
select is(jsonb_array_length(public.reports_source('finance','2026-10-01','2026-10-31')->'rows'),50,'5000 source movements produce only 50 frontend rows');
select is(jsonb_array_length(public.reports_source('finance','2026-10-01','2026-10-31')->'groups'),7,'dimension payload bounded by distinct groups, not dataset size');
select * from finish();
rollback;
