begin;
select no_plan();
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='shipments'),'shipments publishes realtime events');
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('61000000-0000-0000-0000-000000000001','authenticated','authenticated','shipping-a@example.test','',now(),'{}','{"name":"Shipping Admin","company_name":"Shipping A"}',now(),now()),
('61000000-0000-0000-0000-000000000002','authenticated','authenticated','shipping-b@example.test','',now(),'{}','{"name":"Other Admin","company_name":"Shipping B"}',now(),now()),
('61000000-0000-0000-0000-000000000003','authenticated','authenticated','shipping-sales@example.test','',now(),'{}','{"name":"Sales","company_name":"Shipping Sales"}',now(),now());
update public.profiles set role='vendas', company_id=(select company_id from public.profiles where auth_user_id='61000000-0000-0000-0000-000000000001')
where auth_user_id='61000000-0000-0000-0000-000000000003';
insert into public.orders(id,company_id,customer_name,number,status,deadline)
select 'shipping-order',company_id,'Fixture','SHIP-1','producao',now()+interval '1 day' from public.profiles where auth_user_id='61000000-0000-0000-0000-000000000001';
insert into public.order_items(id,order_id,product_name,quantity) values ('shipping-item','shipping-order','Fixture',1);
insert into public.production_queue(id,company_id,order_id,order_number,order_item_id,product_name,quantity,status,priority,deadline)
select 'shipping-queue',company_id,id,number,'shipping-item','Fixture',1,'impressao','media',deadline from public.orders where id='shipping-order';
select set_config('request.jwt.claims','{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is((select result_status from public.transition_production_stage('shipping-queue','concluido',(select updated_at from public.production_queue where id='shipping-queue'))),'UPDATED','production can finish');
select is((select status from public.orders where id='shipping-order'),'producao','ready does not change order');
select is((select status from public.shipments where order_id='shipping-order'),'separacao','ready creates waiting shipment');
select is((select count(*)::int from public.shipments where order_id='shipping-order'),1,'one shipment only');
select is((select result_status from public.transition_production_stage('shipping-queue','expedicao',(select updated_at from public.production_queue where id='shipping-queue'))),'INVALID_STATUS','production cannot control delivery');
select is(public.transition_shipment((select id from public.shipments where order_id='shipping-order'),'enviado',null,null,null)->>'status','CONFLICT','shipping requires version');
select is(public.transition_shipment((select id from public.shipments where order_id='shipping-order'),'entregue',null,null,(select updated_at from public.shipments where order_id='shipping-order'))->>'status','INVALID_INPUT','cannot skip straight to delivered');
select is(public.transition_shipment((select id from public.shipments where order_id='shipping-order'),'enviado','TRACK','Fixture',(select updated_at from public.shipments where order_id='shipping-order'))->>'status','UPDATED','explicit dispatch');
select is(public.transition_shipment((select id from public.shipments where order_id='shipping-order'),'enviado',null,null,(select updated_at from public.shipments where order_id='shipping-order'))->>'status','UNCHANGED','retry current state is idempotent');
select is(public.transition_shipment((select id from public.shipments where order_id='shipping-order'),'em_rota',null,null,'2000-01-01')->>'status','CONFLICT','stale dispatch rejected');
select is(public.transition_shipment((select id from public.shipments where order_id='shipping-order'),'em_rota',null,null,(select updated_at from public.shipments where order_id='shipping-order'))->>'status','UPDATED','explicit route');
select is(public.transition_order_status_and_production('shipping-order','finalizado',(select updated_at from public.orders where id='shipping-order'))->>'status','UPDATED','order independently finalized');
select is((select status from public.shipments where order_id='shipping-order'),'em_rota','order cannot mark delivery complete');
select is((select result_status from public.transition_production_stage('shipping-queue','impressao',(select updated_at from public.production_queue where id='shipping-queue'))),'UPDATED','production independently reopened');
select is((select status from public.shipments where order_id='shipping-order'),'em_rota','production cannot revert shipment');
select is((select result_status from public.transition_production_stage('shipping-queue','concluido',(select updated_at from public.production_queue where id='shipping-queue'))),'UPDATED','production ready again');
select is((select status from public.shipments where order_id='shipping-order'),'em_rota','ensure shipment never resets it');
select is(public.transition_shipment((select id from public.shipments where order_id='shipping-order'),'entregue',null,null,(select updated_at from public.shipments where order_id='shipping-order'))->>'status','UPDATED','explicit delivery');
select is((select status from public.orders where id='shipping-order'),'finalizado','delivery does not overwrite order');
select is((select status from public.production_queue where id='shipping-queue'),'concluido','delivery does not overwrite production');
select ok((select shipped_at is not null and delivered_at is not null from public.shipments where order_id='shipping-order'),'shipment timestamps persist');
set constraints phase4b_audit_business_mutation immediate;
select is((select count(*)::int from public.audit_logs where entity_type='shipments' and action='shipment.status_changed'),3,'exactly one audit per delivery transition');
select ok(exists(select 1 from public.audit_logs where action='shipment.status_changed' and old_values->>'status'='em_rota' and new_values->>'status'='entregue' and actor_user_id='61000000-0000-0000-0000-000000000001'),'audit has real actor and before/after');
reset role;
select set_config('test.shipment_id',(select id from public.shipments where order_id='shipping-order'),true);
select set_config('request.jwt.claims','{"sub":"61000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is(public.transition_shipment(current_setting('test.shipment_id'),'em_rota',null,null,now())->>'status','NOT_FOUND','cross tenant shipment not disclosed');
reset role;
select set_config('request.jwt.claims','{"sub":"61000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select is(public.transition_shipment(current_setting('test.shipment_id'),'em_rota',null,null,now())->>'status','NOT_AUTHORIZED','sales cannot transition shipment');
select * from finish();
rollback;
