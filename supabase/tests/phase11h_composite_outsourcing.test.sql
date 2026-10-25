begin;
set local timezone='America/Bahia';
select no_plan();
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('b1180000-0000-4000-8000-000000000001','authenticated','authenticated','composite-a@example.test','',now(),'{}','{"name":"Composite QA A","company_name":"Composite QA A"}',now(),now()),
 ('b1180000-0000-4000-8000-000000000002','authenticated','authenticated','composite-b@example.test','',now(),'{}','{"name":"Composite QA B","company_name":"Composite QA B"}',now(),now());
select set_config('request.jwt.claims','{"sub":"b1180000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('composite.company',private.current_company_id(),true);
insert into public.products(id,company_id,name,pricing_type,base_cost,sales_price,stock_controlled,current_stock,min_stock,pricing_details) values
 ('h-root',private.current_company_id(),'Banner composto QA','m2',0,100,false,0,0,'{"configurator_options":{"min_area":1}}'),
 ('h-film',private.current_company_id(),'Lona QA','m2',9,20,true,10,2,'{}'),
 ('h-service',private.current_company_id(),'Acabamento externo QA','unidade',5,10,false,0,0,'{}'),
 ('h-kit',private.current_company_id(),'Kit virtual QA','kit',0,40,false,0,0,'{}'),
 ('h-unit',private.current_company_id(),'Item unitário QA','unidade',2,10,true,20,2,'{}'),
 ('h-nested',private.current_company_id(),'Teste de ciclo QA','unidade',0,1,false,0,0,'{}');
create function pg_temp.bom(id text,kind text,parts jsonb) returns jsonb language sql as $$
 select public.composite_command(gen_random_uuid(),'bom_save',jsonb_build_object('product_id',id,'structure_type',kind,'updated_at',(select updated_at from public.products where public.products.id=$1),'components',parts))
$$;
grant execute on function pg_temp.bom(text,text,jsonb) to authenticated;
create function pg_temp.edit_item(patch jsonb default '{}',parent_patch jsonb default '{}') returns jsonb language sql as $$
 select public.save_order_with_items_and_production((select to_jsonb(o)||parent_patch from public.orders o where id='h-order'),
  (select jsonb_agg(to_jsonb(i)||patch) from public.order_items i where order_id='h-order'),(select updated_at from public.orders where id='h-order'))
$$;
grant execute on function pg_temp.edit_item(jsonb,jsonb) to authenticated;
set local role authenticated;
select lives_ok($$select pg_temp.bom('h-root','composite','[{"id":"b1181000-0000-4000-8000-000000000001","component_product_id":"h-film","component_type":"material","quantity":1,"unit":"m2","basis":"area","waste_percent":5},{"id":"b1181000-0000-4000-8000-000000000002","component_product_id":"h-service","component_type":"outsourced_service","quantity":1,"unit":"unidade","basis":"unit","is_outsourced":true}]')$$,'create canonical BOM');
select is((select base_cost from public.products where id='h-root'),14.45::numeric,'Phase6 reference cost includes loss and service, no sale price mutation');
select is((select sales_price from public.products where id='h-root'),100::numeric,'canonical own selling price preserved');
select throws_like($$select pg_temp.bom('h-root','composite','[{"component_product_id":"h-root","component_type":"product","quantity":1,"unit":"m2","basis":"unit"}]')$$,'%si mesmo%','self reference denied');
select throws_like($$select pg_temp.bom('h-nested','composite','[{"component_product_id":"h-root","component_type":"product","quantity":1,"unit":"m2","basis":"unit"}]')$$,'%sem estrutura aninhada%','nested structures denied in v1');
select throws_like($$select pg_temp.bom('h-film','composite','[{"component_product_id":"h-root","component_type":"product","quantity":1,"unit":"m2","basis":"unit"}]')$$,'%um nível%','cannot transform a child into nested/cyclic structure');
select throws_like($$update public.products set structure_type='kit' where id='h-unit'$$,'%Gerencie a estrutura%','direct API cannot forge structure type');
select lives_ok($$select public.composite_source(current_date-1,current_date)$$,'authenticated source loads');
select throws_like($$select pg_temp.bom('h-root','composite','[{"component_product_id":"h-film","component_type":"material","quantity":"NaN","unit":"m2","basis":"area"}]')$$,'%','nonfinite BOM quantity rejected');
select throws_like($$select public.composite_command(gen_random_uuid(),'bom_save',jsonb_build_object('product_id','h-root','updated_at','2000-01-01','structure_type','simple','components','[]'::jsonb))$$,'%outra pessoa%','stale product CAS rejected');
reset role;
insert into public.orders(id,company_id,customer_name,number,status,total_amount,paid_amount,payment_status,deadline) values
 ('h-order',private.current_company_id(),'Cliente sintético QA','PED-9911','producao',100,0,'pendente',now()+interval '2 days');
insert into public.order_items(id,order_id,product_id,product_name,quantity,unit_price,total_price,details,structure_type) values
 ('h-item','h-order','h-root','Banner composto QA',1,100,100,'{"width":1.2,"height":0.8,"billableArea":99}','simple');
set local role authenticated;
select is((select structure_type from public.order_items where id='h-item'),'composite','public structure flag derived by server, forged value ignored');
select ok(not(select to_jsonb(i)?'component_snapshot' from public.order_items i where id='h-item'),'Store order_items wildcard cannot expose internal snapshot');
select ok(not has_table_privilege('authenticated','private.order_component_snapshots','SELECT'),'private snapshots denied to Store customer auth role');
select ok(not has_function_privilege('authenticated','private.item_component_snapshot(text)','EXECUTE'),'private snapshot getter not a customer RPC');
select is(((public.composite_source(current_date,current_date,'h-item')#>>'{items,0,requirements,0,required}')::numeric),1.008::numeric,'real1.20x0.80 plus5percent =1.008, minimum area/clientbillable ignored');
select lives_ok($$select public.ensure_production_queue_for_order('h-order')$$,'canonical production queue');
select is((select current_stock from public.products where id='h-film'),10::numeric,'composite queue itself does not consume');
select set_config('composite.consume_op',gen_random_uuid()::text,true);
select lives_ok($$select public.composite_command(current_setting('composite.consume_op')::uuid,'consume','{"order_item_id":"h-item"}')$$,'explicit consumption');
select is((select current_stock from public.products where id='h-film'),8.992::numeric,'physical stock six decimals preserved');
select throws_like($$select public.composite_command(current_setting('composite.consume_op')::uuid,'consume','{"order_item_id":"h-item","extra":1}')$$,'%Chave%','nonce cannot be reused with changed payload');
select lives_ok($$select public.composite_command(current_setting('composite.consume_op')::uuid,'consume','{"order_item_id":"h-item"}')$$,'exact retry');
select is((select count(*)::int from public.stock_movements where product_id='h-film'),1,'retry only one stock movement');
reset role;
select set_config('request.jwt.claims','{"sub":"b1180000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::int from public.product_components),0,'cross tenant BOM inaccessible');
select is((select count(*)::int from public.component_consumptions),0,'cross tenant consumption inaccessible');
select is((select count(*)::int from public.component_consumption_items),0,'cross tenant physical cost history inaccessible');
select throws_like($$select public.composite_command(gen_random_uuid(),'consume','{"order_item_id":"h-item"}')$$,'%Pedido indisponível%','foreign item command inaccessible');
reset role;
select set_config('request.jwt.claims','{"sub":"b1180000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.customers(id,company_id,auth_user_id,name,email,document,phone,notes) values('h-store-customer',private.current_company_id(),'b1180000-0000-4000-8000-000000000002','Cliente Store QA','composite-b@example.test','111.222.333-44','81000009911','Fixture sintética');
insert into public.store_customer_accounts(company_id,customer_id,auth_user_id,status) values(private.current_company_id(),'h-store-customer','b1180000-0000-4000-8000-000000000002','active');
update public.orders set customer_id='h-store-customer' where id='h-order';
select set_config('request.jwt.claims','{"sub":"b1180000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::int from public.order_items where order_id='h-order'),1,'authenticated Store customer positively reads its linked order item');
select ok(not (select to_jsonb(i) from public.order_items i where id='h-item') ? 'component_snapshot','Store wildcard embedding contains no private snapshot field');
select ok(not exists(select 1 from public.component_consumption_items where product_id='h-film'),'Store customer cannot retrieve component costs through a related table');
reset role;
select set_config('request.jwt.claims','{"sub":"b1180000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select lives_ok($$select pg_temp.edit_item('{"details":{"width":1.2,"height":0.8,"notes":"Nota técnica"}}')$$,'canonical aggregate edits notes and preserves consumed snapshot');
select throws_like($$select pg_temp.edit_item('{"quantity":2}')$$,'%histórico operacional%','physical quantity immutable after consumption');
select throws_like($$delete from public.order_items where id='h-item'$$,'%histórico de consumo%','cannot erase consumed item history');
select throws_like($$select public.transition_production_stage(id,'concluido',updated_at) from public.production_queue where order_item_id='h-item'$$,'%Terceirização pendente%','canonical completion enforces outsourced dependency');
select throws_like($$select public.transition_order_status_and_production(id,'expedicao',updated_at) from public.orders where id='h-order'$$,'%Terceirização pendente%','Order dispatch cannot bypass outsourced dependency');
select throws_like($$select public.transition_order_status_and_production(id,'finalizado',updated_at) from public.orders where id='h-order'$$,'%Terceirização pendente%','Order finalization cannot bypass outsourced dependency');
select throws_like($$select public.transition_order_status_and_production(id,'cancelado',updated_at) from public.orders where id='h-order'$$,'%Reverta os consumos%','canonical cancellation never implies a physical return');
select set_config('composite.supplier',public.purchase_command(gen_random_uuid(),'supplier_save','{"name":"Fornecedor sintético 11H"}')#>>'{supplier,id}',true);
select set_config('composite.ot',(public.composite_command(gen_random_uuid(),'ot_save',jsonb_build_object('order_item_id','h-item','component_id','b1181000-0000-4000-8000-000000000002','supplier_id',current_setting('composite.supplier'),'title','Acabamento sintético','specification','QA sem operação real','quantity',1,'unit','unidade','due_date',current_date+2,'unit_cost',5,'freight',2)))->>'id',true);
create function pg_temp.ot(a text,patch jsonb default '{}') returns jsonb language sql as $$
 select public.composite_command(gen_random_uuid(),a,(select jsonb_build_object('id',id,'updated_at',updated_at) from public.outsourcing_orders where id=current_setting('composite.ot')::uuid)||patch)
$$;
grant execute on function pg_temp.ot(text,jsonb) to authenticated;
select is((select number from public.outsourcing_orders where id=current_setting('composite.ot')::uuid),1::bigint,'tenant-scoped first OT number');
select lives_ok($$select pg_temp.ot('ot_transition','{"status":"issued"}')$$,'issue technical OT');
select lives_ok($$select pg_temp.ot('ot_transition','{"status":"confirmed"}')$$,'confirm technical OT');
select throws_like($$select public.composite_command(gen_random_uuid(),'ot_save',jsonb_build_object('id',current_setting('composite.ot'),'updated_at',(select updated_at from public.outsourcing_orders where id=current_setting('composite.ot')::uuid)))$$,'%Somente rascunho%','confirmed technical snapshot frozen');
select lives_ok($$select pg_temp.ot('ot_dispatch','{"materials_sent":true,"notes":"1,008 m² de lona QA já consumida, sem operação real."}')$$,'explicit physical-material dispatch reference');
select is((select count(*)::int from public.stock_movements where product_id='h-film'),1,'dispatch does not consume material twice');
select is((select status from public.production_queue where order_item_id='h-item'),'fila','OT status independent of production');
select throws_like($$select pg_temp.ot('ot_receive',jsonb_build_object('quantity',1.1,'received_date',current_date,'quality','accepted'))$$,'%excede%','reject excess outsourced receipt');
select set_config('composite.r1',pg_temp.ot('ot_receive',jsonb_build_object('quantity',0.4,'received_date',current_date,'quality','accepted','notes','Conferência parcial QA'))->>'receipt_id',true);
select is((select status from public.outsourcing_orders where id=current_setting('composite.ot')::uuid),'partial','partial outsourced receipt');
select set_config('composite.r2',pg_temp.ot('ot_receive',jsonb_build_object('quantity',0.6,'received_date',current_date,'quality','with_reservations','notes','Conferência final QA'))->>'receipt_id',true);
select is((select status from public.outsourcing_orders where id=current_setting('composite.ot')::uuid),'received','full outsourced receipt');
select is((select status from public.production_queue where order_item_id='h-item'),'fila','receipt never synchronizes production status');
select lives_ok($$select pg_temp.ot('ot_cost','{"actual_cost":6,"reason":"Valor efetivo sintético da conferência"}')$$,'record actual contracted cost');
select is((select estimated_cost from public.outsourcing_orders where id=current_setting('composite.ot')::uuid),5::numeric,'estimated cost remains historical');
select lives_ok($$select pg_temp.ot('ot_purchase',jsonb_build_object('due_date',current_date+10))$$,'OT generates canonical service purchase');
select is((select count(*)::int from public.purchase_orders),1,'only one commercial purchase');
select is((select total from public.purchase_orders),8::numeric,'actual6 plus freight2 reconciles commercial contract');
select is((select count(*)::int from public.purchase_order_items where stock_controlled),0,'service purchase cannot introduce physical component receipt');
select throws_like($$select pg_temp.ot('ot_purchase',jsonb_build_object('due_date',current_date+10))$$,'%nenhum vínculo anterior%','new nonce cannot duplicate purchase obligation');
select throws_like($$select pg_temp.ot('ot_cost','{"actual_cost":7,"reason":"Tentativa de alterar obrigação já vinculada"}')$$,'%sem Compra vinculada%','actual cost cannot silently alter linked purchase');
select throws_like($$select pg_temp.ot('ot_receipt_reverse',jsonb_build_object('receipt_id',current_setting('composite.r2'),'reason','Encerrar fixture QA'))$$,'%Cancele a Compra%','reverse OT requires canonical purchase resolution');
select lives_ok($$select public.purchase_command(gen_random_uuid(),'order_transition',(select jsonb_build_object('id',id,'updated_at',updated_at,'status','cancelled') from public.purchase_orders))$$,'cancel synthetic commercial obligation before reversal');
select lives_ok($$select pg_temp.ot('ot_receipt_reverse',jsonb_build_object('receipt_id',current_setting('composite.r2'),'reason','Encerramento da fixture QA'))$$,'reverse final outsourced receipt');
select lives_ok($$select pg_temp.ot('ot_receipt_reverse',jsonb_build_object('receipt_id',current_setting('composite.r1'),'reason','Encerramento da fixture QA'))$$,'reverse partial outsourced receipt');
select throws_like($$select pg_temp.ot('ot_transition','{"status":"cancelled"}')$$,'%registre retorno%','material dispatch cannot disappear on cancellation');
select lives_ok($$select pg_temp.ot('ot_return','{"reason":"Materiais QA retornados; reverter consumo explicitamente."}')$$,'record explicit return reference');
select lives_ok($$select pg_temp.ot('ot_transition','{"status":"cancelled"}')$$,'close operational OT while preserving history');
select lives_ok($$select public.composite_command(gen_random_uuid(),'consumption_reverse',jsonb_build_object('order_item_id','h-item','consumption_id',(select id from public.component_consumptions where order_item_id='h-item' and reversed_at is null),'reason','Encerramento da fixture sintética'))$$,'reverse component consumption after return');
select is((select current_stock from public.products where id='h-film'),10::numeric,'stock baseline restored exactly');
select is((select count(*)::int from public.stock_movements where product_id='h-film'),2,'one consumption and one inverse, no erased history');
select lives_ok($$select public.transition_order_status_and_production(id,'cancelado',updated_at) from public.orders where id='h-order'$$,'cancel parent after explicit operational cleanup');
select lives_ok($$select pg_temp.bom('h-kit','kit','[{"component_product_id":"h-unit","component_type":"product","quantity":2,"unit":"unidade","basis":"unit"}]')$$,'kit uses canonical component products and own price');
reset role;
insert into public.orders(id,company_id,customer_name,number,status,total_amount,paid_amount,payment_status,deadline) values
 ('h-kit-order',private.current_company_id(),'Kit QA','PED-9912','producao',80,0,'pendente',now()+interval '2 days'),
 ('h-short-order',private.current_company_id(),'Kit sem saldo QA','PED-9913','producao',8000,8000,'pago',now()+interval '2 days');
insert into public.order_items(id,order_id,product_id,product_name,quantity,unit_price,total_price,details) values
 ('h-kit-item','h-kit-order','h-kit','Kit QA',2,40,80,'{}'),('h-short-item','h-short-order','h-kit','Kit sem saldo',200,40,8000,'{}');
update public.profiles set role='vendas' where auth_user_id=auth.uid();
set local role authenticated;
select is(public.adjust_inventory_stock('h-unit',1,'saida','Não autorizado')->>'status','NOT_AUTHORIZED','salesperson has no manual stock authority');
select lives_ok($$select public.save_order_with_items_and_production((select to_jsonb(o) from public.orders o where id='h-kit-order'),(select jsonb_agg(to_jsonb(i)) from public.order_items i where order_id='h-kit-order'),(select updated_at from public.orders where id='h-kit-order'))$$,'sale-authorized kit consumption works without Stock permission');
select is((select current_stock from public.products where id='h-unit'),16::numeric,'two kits consume four component units');
select is((select current_stock from public.products where id='h-kit'),0::numeric,'virtual kit never owns stock');
select lives_ok($$select public.ensure_production_queue_for_order('h-short-order')$$,'insufficient stock does not erase a recorded sale/payment');
select is((select paid_amount from public.orders where id='h-short-order'),8000::numeric,'already recorded payment preserved honestly');
select is((select current_stock from public.products where id='h-unit'),16::numeric,'shortage leaves all physical stock untouched');
select is(jsonb_array_length(public.composite_source(current_date,current_date)->'orders'),0,'Products-only actor cannot read outsourcing registry through source');
select throws_like($$select public.composite_command(gen_random_uuid(),'consume','{"order_item_id":"h-short-item"}')$$,'%Sem permissão%','manual production consumption denied to salesperson');
reset role;
select set_config('request.jwt.claims','{}',true);
insert into public.orders(id,company_id,customer_name,number,status,total_amount,paid_amount,payment_status,deadline) values
 ('h-system-order',current_setting('composite.company'),'Checkout sintético sem JWT','PED-9914','producao',40,40,'pago',now()+interval '2 days');
insert into public.order_items(id,order_id,product_id,product_name,quantity,unit_price,total_price,details) values
 ('h-system-item','h-system-order','h-kit','Kit checkout QA',1,40,40,'{}');
select lives_ok($$select private.ensure_production_queue_for_order('h-system-order',current_setting('composite.company'))$$,'trusted checkout/payment automation consumes kit without interactive JWT');
select is((select current_stock from public.products where id='h-unit'),14::numeric,'system kit consumes canonical components');
select is((select actor_name from public.audit_logs where action='component.consumed' and new_values->>'order_item_id'='h-system-item'),'SYSTEM','system audit respects existing identity contract');
select ok(not exists(select 1 from public.audit_logs where action='component.consumed' and new_values->>'order_item_id'='h-system-item' and (actor_user_id is not null or actor_profile_id is not null)),'system event never impersonates a staff user');
select set_config('request.jwt.claims','{"sub":"b1180000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.profiles set role='admin' where auth_user_id=auth.uid();
insert into public.products(id,company_id,name,pricing_type,base_cost,sales_price,stock_controlled,current_stock,min_stock) values('h-optional',private.current_company_id(),'Opcionais QA','unidade',0,1,false,0,0);
set local role authenticated;
select lives_ok($$select pg_temp.bom('h-optional','composite','[{"id":"b1181000-0000-4000-8000-000000000003","component_product_id":"h-unit","component_type":"material","quantity":1,"unit":"unidade","basis":"unit","is_optional":true}]')$$,'optional physical component defined');
reset role;
insert into public.orders(id,company_id,customer_name,number,status,total_amount,paid_amount,payment_status,deadline,updated_at) values('h-optional-order',private.current_company_id(),'Opcional QA','PED-9915','producao',1,0,'pendente',now()+interval '2 days','2000-01-01');
insert into public.order_items(id,order_id,product_id,product_name,quantity,unit_price,total_price,details) values('h-optional-item','h-optional-order','h-optional','Opcional QA',1,1,1,'{}');
insert into public.role_permissions(company_id,path,roles) values(private.current_company_id(),'/production','{}'),(private.current_company_id(),'/outsourcing','{admin}') on conflict(company_id,path) do update set roles=excluded.roles;
set local role authenticated;
select throws_like($$select public.composite_command(gen_random_uuid(),'optional_select','{"order_item_id":"h-optional-item","selected":["b1181000-0000-4000-8000-000000000003"]}')$$,'%Sem permissão%','outsourcing permission alone cannot alter physical optionals');
reset role;
update public.role_permissions set roles=case path when '/production' then '{admin}'::text[] else '{}'::text[] end where company_id=private.current_company_id() and path in('/production','/outsourcing');
set local role authenticated;
select set_config('composite.order_before',(select to_jsonb(o)::text from public.orders o where id='h-optional-order'),true);
select set_config('composite.items_before',(select jsonb_agg(to_jsonb(i))::text from public.order_items i where order_id='h-optional-order'),true);
select set_config('composite.optional_op',gen_random_uuid()::text,true);
select set_config('composite.optional_payload',jsonb_build_object('order_item_id','h-optional-item','expected_order_updated_at',current_setting('composite.order_before')::jsonb->>'updated_at','selected',jsonb_build_array('b1181000-0000-4000-8000-000000000003'))::text,true);
select lives_ok($$select public.composite_command(current_setting('composite.optional_op')::uuid,'optional_select',current_setting('composite.optional_payload')::jsonb)$$,'production selects optionals without outsourcing or stock command');
select ok((select updated_at from public.orders where id='h-optional-order')>(current_setting('composite.order_before')::jsonb->>'updated_at')::timestamptz,'optional selection advances canonical parent Order version');
select is(public.save_order_with_items_and_production(current_setting('composite.order_before')::jsonb,current_setting('composite.items_before')::jsonb,(current_setting('composite.order_before')::jsonb->>'updated_at')::timestamptz)->>'result_status','CONFLICT','old aggregate form cannot overwrite optional selection');
select is((select details->'optional_component_ids' from public.order_items where id='h-optional-item'),jsonb_build_array('b1181000-0000-4000-8000-000000000003'),'rejected stale aggregate preserves physical selection');
select lives_ok($$select public.composite_command(current_setting('composite.optional_op')::uuid,'optional_select',current_setting('composite.optional_payload')::jsonb)$$,'same nonce retry succeeds before parent CAS check');
select throws_like($$select public.composite_command(gen_random_uuid(),'optional_select',current_setting('composite.optional_payload')::jsonb)$$,'%Pedido atualizado por outra pessoa%','another optional session with stale version rejected');
select is((select current_stock from public.products where id='h-unit'),14::numeric,'optional selection never consumes stock');
select set_config('composite.request',public.composite_command(gen_random_uuid(),'purchase_request','{"order_item_id":"h-short-item","product_id":"h-unit"}')->>'id',true);
select is(public.composite_command(gen_random_uuid(),'purchase_request','{"order_item_id":"h-short-item","product_id":"h-unit"}')->>'id',current_setting('composite.request'),'different nonce reuses open request for the same item/material shortage');
select is((select count(*)::int from public.purchase_requests),1,'repeated shortage action does not duplicate purchase drafts');
select public.purchase_command(gen_random_uuid(),'request_transition',(select to_jsonb(r)||'{"status":"requested"}'::jsonb from public.purchase_requests r where id=current_setting('composite.request')::uuid));
select public.purchase_command(gen_random_uuid(),'request_transition',(select to_jsonb(r)||'{"status":"approved"}'::jsonb from public.purchase_requests r where id=current_setting('composite.request')::uuid));
select set_config('composite.material_purchase',public.purchase_command(gen_random_uuid(),'order_save',jsonb_build_object('supplier_id',current_setting('composite.supplier'),'request_id',current_setting('composite.request'),'ordered_date',current_date,'expected_date',current_date+2,'items',(select jsonb_agg(jsonb_build_object('product_id',product_id,'description',description,'quantity',quantity,'unit',unit,'unit_price',1,'stock_controlled',true)) from public.purchase_request_items where request_id=current_setting('composite.request')::uuid),'installments',(select jsonb_build_array(jsonb_build_object('due_date',current_date+2,'amount',sum(quantity))) from public.purchase_request_items where request_id=current_setting('composite.request')::uuid)))->>'id',true);
select is(public.composite_command(gen_random_uuid(),'purchase_request','{"order_item_id":"h-short-item","product_id":"h-unit"}')->>'id',current_setting('composite.request'),'converted request reused while matching material purchase has pending quantity');
select public.purchase_command(gen_random_uuid(),'order_transition',(select to_jsonb(pc)||'{"status":"issued"}'::jsonb from public.purchase_orders pc where id=current_setting('composite.material_purchase')::uuid));
select public.purchase_command(gen_random_uuid(),'order_transition',(select to_jsonb(pc)||'{"status":"confirmed"}'::jsonb from public.purchase_orders pc where id=current_setting('composite.material_purchase')::uuid));
select public.purchase_command(gen_random_uuid(),'receive',jsonb_build_object('id',pc.id,'updated_at',pc.updated_at,'received_date',current_date,'items',(select jsonb_agg(jsonb_build_object('item_id',pi.id,'quantity',pi.quantity)) from public.purchase_order_items pi where pi.order_id=pc.id))) from public.purchase_orders pc where id=current_setting('composite.material_purchase')::uuid;
select public.adjust_inventory_stock('h-unit',386,'saida','Outro consumo exclusivamente na fixture local SQL');
select set_config('composite.new_request',public.composite_command(gen_random_uuid(),'purchase_request','{"order_item_id":"h-short-item","product_id":"h-unit"}')->>'id',true);
select isnt(current_setting('composite.new_request'),current_setting('composite.request'),'fully received purchase does not block a new legitimate shortage request');
select public.purchase_command(gen_random_uuid(),'request_save',(select to_jsonb(r)||'{"items":[{"product_id":"h-film","description":"Lona QA","quantity":1,"unit":"m2"}]}'::jsonb from public.purchase_requests r where id=current_setting('composite.new_request')::uuid));
select isnt(public.composite_command(gen_random_uuid(),'purchase_request','{"order_item_id":"h-short-item","product_id":"h-unit"}')->>'id',current_setting('composite.new_request'),'edited request for another material is not reused through historical provenance');
select * from finish();
rollback;
