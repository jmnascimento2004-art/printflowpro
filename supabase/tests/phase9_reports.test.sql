begin;
-- Default cash dates are in Bahia, including the three hours after UTC midnight.
set local timezone='America/Bahia';
select no_plan();
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('59000000-0000-0000-0000-000000000001','authenticated','authenticated','phase9-a@example.test','',now(),'{}','{"name":"Phase9 A","company_name":"Phase9 A"}',now(),now()),
('59000000-0000-0000-0000-000000000002','authenticated','authenticated','phase9-b@example.test','',now(),'{}','{"name":"Phase9 B","company_name":"Phase9 B"}',now(),now());
select set_config('request.jwt.claims','{"sub":"59000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select set_config('phase9.a',public.finance_command(gen_random_uuid(),'account_create','{"name":"Bank A","kind":"bank","amount":1000}')#>>'{account,id}',true);
select set_config('phase9.b',public.finance_command(gen_random_uuid(),'account_create','{"name":"Bank B","kind":"bank","amount":0}')#>>'{account,id}',true);
select set_config('phase9.category',public.finance_command(gen_random_uuid(),'category_create','{"name":"Custos estruturados","type":"despesa"}')->>'id',true);
reset role;
insert into public.customers(id,company_id,name,document) values('phase9-c',private.current_company_id(),'Customer A','');
insert into public.suppliers(id,company_id,name) values('phase9-supplier',private.current_company_id(),'Supplier A');
insert into public.orders(id,company_id,customer_id,customer_name,number,total_amount,paid_amount,status,created_at) values
('phase9-o',private.current_company_id(),'phase9-c','Customer A','PED-9001',300,80,'cancelado','2026-10-01T12:00Z'),
('phase9-partial',private.current_company_id(),'phase9-c','Customer A','PED-9002',300,80,'producao','2026-10-01T12:00Z');
update public.orders set customer_name='Customer historical name' where id='phase9-o';
insert into public.financial_transactions(id,company_id,account_id,type,category,amount,description,payment_method,status,due_date,paid_at,source,order_id) values
('phase9-income',private.current_company_id(),current_setting('phase9.a')::uuid,'receita','Vendas',80,'Partial real payment','pix','pago','2026-10-01','2026-10-01T12:00Z','order_payment','phase9-o'),
('phase9-second',private.current_company_id(),current_setting('phase9.a')::uuid,'receita','Vendas',80,'Second partial','pix','pago','2026-10-01','2026-10-01T12:00Z','order_payment','phase9-partial'),
('phase9-expense',private.current_company_id(),current_setting('phase9.a')::uuid,'despesa','Custos',30,'Expense','pix','pago','2026-10-02','2026-10-02T12:00Z','manual',null),
('phase9-pending',private.current_company_id(),current_setting('phase9.a')::uuid,'receita','Vendas',220,'Unpaid remainder','faturado','pendente','2026-10-15',null,'order_payment','phase9-partial');
insert into public.financial_transactions(id,company_id,account_id,type,category,amount,payment_method,status,due_date,paid_at,source,reversal_of)
values('phase9-reversal',private.current_company_id(),current_setting('phase9.a')::uuid,'despesa','Vendas',80,'pix','pago','2026-11-01','2026-11-01T12:00Z','reversal','phase9-income');
select set_config('printflow.finance_command','on',true);
update public.financial_transactions set reversed_at='2026-11-01T12:00Z' where id='phase9-income';
select set_config('printflow.finance_command','off',true);
set local role authenticated;
select is((public.reports_source('finance','2026-10-01','2026-10-31')#>>'{summary,income}')::numeric,160::numeric,'cash includes historical receipt despite cancelled Order; only real partial');
select is((public.reports_source('finance','2026-10-01','2026-10-31')#>>'{summary,expense}')::numeric,30::numeric,'real expense counted');
select is((public.reports_source('finance','2026-10-01','2026-10-31')#>>'{summary,result}')::numeric,130::numeric,'DRE reconciles income less expense');
select is((public.reports_source('finance','2026-11-01','2026-11-30')#>>'{summary,income}')::numeric,-80::numeric,'reversal reduces original revenue in reversal cash month');
select is((public.reports_source('finance','2026-11-01','2026-11-30')#>>'{summary,expense}')::numeric,0::numeric,'reversal is not new expense');
select is((public.reports_source('finance','2026-10-01','2026-11-30')#>>'{summary,result}')::numeric,50::numeric,'period with original and reversal neutralizes exactly');
select is((public.reports_source('finance','2026-10-01','2026-10-31','{"method":"faturado"}')#>>'{summary,income}')::numeric,0::numeric,'pending receivable never realized');
select is(jsonb_array_length(public.reports_source('finance','2026-10-01','2026-10-31','{}',0,1)->'rows'),1,'database paging bounds response');
select is((public.reports_source('finance','2026-10-01','2026-10-31','{}',0,1)->>'total')::integer,4,'pagination retains aggregate row total including bridge opening');
select is((select sum((g->>'result')::numeric) from jsonb_array_elements(public.reports_source('finance','2026-10-01','2026-10-31')->'groups') g where g->>'dimension'='category'),130::numeric,'category analytical groups reconcile with DRE');
select is((select count(*)::integer from jsonb_array_elements(public.reports_source('finance','2026-10-01','2026-10-31')->'groups') g where g->>'dimension'='customer' and g->>'key'='phase9-c'),1,'one stable customer group despite renamed historical snapshot');
select is((select r->>'order_id' from jsonb_array_elements(public.reports_source('finance','2026-11-01','2026-11-30')->'rows') r where r->>'id'='phase9-reversal'),'phase9-o','reversal exposes resolved source Order');
select is((public.reports_source('finance','2026-10-01','2026-10-31','{"category":"legacy:Vendas"}')#>>'{summary,result}')::numeric,160::numeric,'legacy exact category filter reconciles');
select is((public.reports_source('finance','2026-10-01','2026-10-31','{"type":"despesa"}')#>>'{summary,result}')::numeric,-30::numeric,'type filter reconciles');
select is((public.reports_source('finance','2026-10-01','2026-10-31',jsonb_build_object('account',current_setting('phase9.b')))#>>'{summary,result}')::numeric,0::numeric,'account filter excludes other account');
select public.finance_command(gen_random_uuid(),'transfer',jsonb_build_object('account_id',current_setting('phase9.a'),'destination_id',current_setting('phase9.b'),'amount',100,'description','Neutral transfer'));
select public.finance_command(gen_random_uuid(),'adjust',jsonb_build_object('account_id',current_setting('phase9.a'),'type','receita','amount',20,'description','Adjustment not income'));
select is((public.reports_source('finance',current_date,current_date)#>>'{summary,result}')::numeric,case when current_date between '2026-10-01'::date and '2026-10-02'::date then 130 else 0 end::numeric,'opening, transfer and adjustment are not operating result');
select is((public.reports_source('finance',current_date,current_date)#>>'{summary,transfer}')::numeric,0::numeric,'two transfer legs neutral in consolidated report');
select is((public.reports_source('finance',current_date,current_date)#>>'{summary,adjustment}')::numeric,20::numeric,'adjustments disclosed explicitly outside DRE');
select is((public.reports_source('finance',current_date,current_date)#>>'{summary,opening}')::numeric,1000::numeric,'opening is bridge item, not revenue');
select set_config('phase9.payable',public.finance_command(gen_random_uuid(),'payable_create',jsonb_build_object('account_id',current_setting('phase9.a'),'category_id',current_setting('phase9.category'),'supplier_id','phase9-supplier','amount',45,'description','Payable','date',current_date))#>>'{transaction,id}',true);
select is((public.reports_source('finance',current_date,current_date)#>>'{summary,expense}')::numeric,0::numeric,'pending payable excluded');
select public.finance_command(gen_random_uuid(),'payable_pay',(select jsonb_build_object('id',id,'updated_at',updated_at,'account_id',account_id) from public.financial_transactions where id=current_setting('phase9.payable')));
select is((public.reports_source('finance',current_date,current_date)#>>'{summary,expense}')::numeric,45::numeric,'paid payable contributes exactly one cash movement');
select public.finance_command(gen_random_uuid(),'payable_reverse',(select jsonb_build_object('id',id,'updated_at',updated_at) from public.financial_transactions where id=current_setting('phase9.payable')));
select is((public.reports_source('finance',current_date,current_date)#>>'{summary,expense}')::numeric,0::numeric,'payable reversal compensates original expense');
select is((select sum((g->>'expense')::numeric) from jsonb_array_elements(public.reports_source('finance',current_date,current_date)->'groups') g where g->>'dimension'='supplier' and g->>'key'='phase9-supplier'),0::numeric,'supplier group includes original payment and its reversal');
select is((public.reports_source('finance',current_date,current_date,'{"supplier":"phase9-supplier"}')#>>'{summary,expense}')::numeric,0::numeric,'supplier drilldown reconciles with group');
select is((public.reports_source('sales','2026-10-01','2026-10-31')->'orders'->0->>'total_amount')::numeric,300::numeric,'commercial source retains canonical order amount');
select ok(not has_function_privilege('anon','public.reports_source(text,date,date,jsonb,integer,integer)','execute'),'anonymous execution revoked');
select ok(not has_function_privilege('authenticated','private.reports_can_access(text)','execute'),'internal permission helper not exposed');
select throws_ok($$select public.reports_source('finance','2025-01-01','2026-10-31')$$,'22023','Invalid report window','oversized period rejected');
select throws_ok($$select public.reports_source('finance','2026-10-31','2026-10-01')$$,'22023','Invalid report window','reverse window rejected');
select throws_ok($$select public.reports_source('fake','2026-10-01','2026-10-31')$$,'22023','Invalid report','unknown report rejected');
select throws_ok($$select public.reports_source('finance','2026-10-01','2026-10-31','{}',0,10001)$$,'22023','Invalid report window','oversized export rejected');
select set_config('request.jwt.claims','{"sub":"59000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is((public.reports_source('finance','2026-10-01','2026-10-31')#>>'{summary,result}')::numeric,0::numeric,'tenant B cannot see tenant A movements');
select is(jsonb_array_length(public.reports_source('sales','2026-10-01','2026-10-31')->'orders'),0,'tenant B cannot see tenant A commercial sources');
select is(jsonb_array_length(public.reports_receivable_source('2026-10-01','2026-10-31')->'orders'),0,'tenant B cannot see tenant A exposure');
reset role;
select set_config('request.jwt.claims','{"sub":"59000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.profiles set role='vendas' where auth_user_id='59000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select public.reports_source('finance','2026-10-01','2026-10-31')$$,'42501','Report access denied','commercial role cannot use financial report source');
select lives_ok($$select public.reports_source('sales','2026-10-01','2026-10-31')$$,'commercial role retains authorized sales reports');
reset role;
update public.profiles set role='admin' where auth_user_id='59000000-0000-0000-0000-000000000001';
insert into public.role_permissions(company_id,path,roles) values(private.current_company_id(),'/financial','{}'),(private.current_company_id(),'/orders','{}'),(private.current_company_id(),'/crm','{}'),(private.current_company_id(),'/products','{}') on conflict(company_id,path) do update set roles=excluded.roles;
set local role authenticated;
select throws_ok($$select public.reports_source('finance','2026-10-01','2026-10-31')$$,'42501','Report access denied','admin explicit finance denial enforced in database');
select throws_ok($$select public.reports_receivable_source('2026-10-01','2026-10-31')$$,'42501','Report access denied','receivable source cannot bypass denial');
select throws_ok($$select public.reports_source('sales','2026-10-01','2026-10-31')$$,'42501','Report access denied','sales denial enforced');
select throws_ok($$select public.reports_source('customers','2026-10-01','2026-10-31')$$,'42501','Report access denied','customer denial enforced');
select throws_ok($$select public.reports_source('products','2026-10-01','2026-10-31')$$,'42501','Report access denied','product denial enforced');
select * from finish();
rollback;
