-- Guard optional selection against stale Order forms and other production sessions.
create or replace function public.composite_command(p_operation_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c text:=private.current_company_id();memo private.composite_commands%rowtype;result jsonb:='{}';o public.orders%rowtype;i public.order_items%rowtype;
 t public.outsourcing_orders%rowtype;r public.outsourcing_receipts%rowtype;cons public.component_consumptions%rowtype;s public.suppliers%rowtype;q public.production_queue%rowtype;
 component jsonb;x record;stock jsonb;qty numeric;received numeric;number bigint;target text;received_on date;key uuid;parent_id text;prior_order_version timestamptz;begin
 if auth.uid() is null or c is null or p_operation_id is null or p_action is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>200000 then raise exception 'Comando inválido ou usuário não autenticado.' using errcode='42501';end if;
 if not private.composite_allowed(case when p_action='bom_save' then '/products' when p_action in ('consume','consumption_reverse','purchase_request','optional_select') then '/production' else '/outsourcing' end) then raise exception 'Sem permissão para esta operação.' using errcode='42501';end if;
 if p_action in ('consume','consumption_reverse') and not private.purchase_allowed('/stock') then raise exception 'Consumo físico exige permissão de Estoque.' using errcode='42501';end if;
 if p_action in ('ot_receive','ot_receipt_reverse') and not private.composite_allowed('/outsourcing/receive') then raise exception 'Sem permissão para receber terceirizações.' using errcode='42501';end if;
 if p_action in ('ot_transition','ot_dispatch','ot_return','ot_cost') and not private.composite_allowed('/outsourcing/approve') then raise exception 'Sem permissão para confirmar ou alterar custos de terceirização.' using errcode='42501';end if;
 if p_action in ('ot_purchase','purchase_request') and not private.purchase_allowed('/purchases') then raise exception 'Integração exige acesso a Compras.' using errcode='42501';end if;
 perform private.saas_assert_write(c,null);
 if p_action='bom_save' then
  perform pg_advisory_xact_lock(hashtextextended('bom-definition:'||c,0));
 else
  if p_action like 'ot_%' and p_action<>'ot_save' or (p_action='ot_save' and nullif(p_payload->>'id','') is not null) then
   select * into t from public.outsourcing_orders where company_id=c and id=(p_payload->>'id')::uuid;
   if not found then raise exception 'Ordem de terceirização indisponível.' using errcode='P0002';end if;parent_id:=t.order_id;
  else
   select * into i from public.order_items where id=p_payload->>'order_item_id';parent_id:=i.order_id;
  end if;
  select * into o from public.orders where company_id=c and id=parent_id for update;
  if not found then raise exception 'Pedido indisponível.' using errcode='P0002';end if;
  if t.id is null then
   select * into i from public.order_items where order_id=o.id and id=p_payload->>'order_item_id';
   if not found then raise exception 'Item indisponível após atualização do Pedido.' using errcode='40001';end if;
  end if;
 end if;
 select * into memo from private.composite_commands where company_id=c and operation_id=p_operation_id;
 if found then
  if memo.actor<>auth.uid() then raise exception 'Sem permissão para repetir operação de outro usuário.' using errcode='42501';end if;
  if memo.action<>p_action or memo.payload<>p_payload then raise exception 'Chave de operação reutilizada.' using errcode='22023';end if;
  return memo.result;
 end if;
 if p_action='bom_save' then result:=private.save_product_components(c,p_payload,p_operation_id);
 else
  if t.id is not null then
   select * into t from public.outsourcing_orders where company_id=c and id=t.id for update;
   if t.updated_at is distinct from (p_payload->>'updated_at')::timestamptz then raise exception 'Registro atualizado por outra pessoa.' using errcode='40001';end if;
   select * into i from public.order_items where order_id=o.id and id=t.order_item_id;
  end if;
  if p_action='optional_select' then
   prior_order_version:=o.updated_at;
   if (p_payload->>'expected_order_updated_at')::timestamptz is distinct from prior_order_version then raise exception 'Pedido atualizado por outra pessoa. Atualize e confira a seleção antes de continuar.' using errcode='40001';end if;
   if i.structure_type<>'composite' or jsonb_typeof(p_payload->'selected') is distinct from 'array' or exists(select 1 from public.component_consumptions where order_item_id=i.id) or exists(select 1 from public.outsourcing_orders where order_item_id=i.id) then raise exception 'Opcionais exigem composto sem histórico operacional.' using errcode='22023';end if;
   if exists(select 1 from jsonb_array_elements_text(p_payload->'selected') v where not exists(select 1 from jsonb_array_elements(private.item_component_snapshot(i.id)->'components') z where (z->>'is_optional')::boolean and z->>'id'=v)) then raise exception 'Componente opcional inválido.' using errcode='22023';end if;
   update public.order_items set details=jsonb_set(coalesce(details,'{}'),'{optional_component_ids}',p_payload->'selected') where id=i.id;
   update public.orders set updated_at=clock_timestamp() where id=o.id and company_id=c returning updated_at into o.updated_at;
   if o.updated_at<=prior_order_version then raise exception 'Pedido em outra operação. Atualize e tente novamente.' using errcode='40001';end if;
   result:=jsonb_build_object('order_updated_at',o.updated_at);
   perform private.composite_audit(c,'component.optional_selected','order_items',i.id,jsonb_build_object('selected',p_payload->'selected'),p_operation_id);
  elsif p_action='consume' then
   if o.status not in ('producao','impressao','acabamento') or coalesce(private.item_component_snapshot(i.id)->>'type','simple')='simple' then raise exception 'Consumo exige item composto/kit de Pedido em produção.' using errcode='22023';end if;
   result:=jsonb_build_object('consumption_id',private.consume_components(c,i,true));
  elsif p_action='consumption_reverse' then
   select * into cons from public.component_consumptions where company_id=c and order_item_id=i.id and id=(p_payload->>'consumption_id')::uuid for update;
   if not found or cons.reversed_at is not null then raise exception 'Consumo indisponível ou já revertido.' using errcode='40001';end if;
   if length(btrim(coalesce(p_payload->>'reason',''))) not between 5 and 2000 then raise exception 'Informe motivo de reversão com ao menos 5 caracteres.' using errcode='22023';end if;
   if exists(select 1 from public.production_queue where company_id=c and order_item_id=i.id and status in ('concluido','expedicao','entregue','finalizado')) or
    exists(select 1 from public.outsourcing_orders where company_id=c and order_item_id=i.id and (status not in ('draft','cancelled') or (materials_sent and dispatched_at is not null and returned_at is null))) then
    raise exception 'Reabra a Produção e encerre/registre retorno das terceirizações antes de reverter o consumo.' using errcode='22023';end if;
   perform 1 from public.products where company_id=c and id in(select product_id from public.component_consumption_items where consumption_id=cons.id and physical) order by id for update;
   for x in select * from public.component_consumption_items where company_id=c and consumption_id=cons.id order by product_id loop
    if x.physical then
     stock:=private.move_inventory(c,x.product_id,x.quantity,'entrada','Reversão de consumo · '||cons.id,round(x.unit_cost,2));
     if stock->>'status'<>'UPDATED' then raise exception 'Falha na reversão física.' using errcode='22023';end if;
     update public.component_consumption_items set reversal_movement_id=stock#>>'{movement,id}' where id=x.id;
    end if;
   end loop;
   update public.component_consumptions set reversed_at=clock_timestamp(),reversed_by=auth.uid(),reversal_reason=p_payload->>'reason' where id=cons.id;
   perform private.composite_audit(c,'component.consumption_reversed','component_consumptions',cons.id::text,jsonb_build_object('reason',p_payload->>'reason','order_item_id',i.id),p_operation_id);
  elsif p_action='purchase_request' then
   select z.* into x from private.component_requirements(i) z where z.component->>'product_id'=p_payload->>'product_id' and (z.component->>'stock_controlled')::boolean and not(z.component->>'is_outsourced')::boolean;
   if not found then raise exception 'Componente físico indisponível.' using errcode='22023';end if;
   select greatest(0,x.required-current_stock) into qty from public.products where company_id=c and id=x.component->>'product_id';
   if qty<=0 then raise exception 'Componente sem falta de estoque.' using errcode='22023';end if;
   -- The parent Order lock also serializes different nonces/actors for one shortage.
   select jsonb_build_object('id',pr.id,'reused',true) into result
    from private.composite_commands prior join public.purchase_requests pr on pr.id=(prior.result->>'id')::uuid and pr.company_id=c
    where prior.company_id=c and prior.action='purchase_request' and prior.payload->>'order_item_id'=i.id and prior.payload->>'product_id'=x.component->>'product_id'
     and ((pr.status in('draft','requested','approved') and exists(select 1 from public.purchase_request_items ri where ri.request_id=pr.id and ri.company_id=c and ri.product_id=x.component->>'product_id' and ri.unit=x.component->>'unit'))
      or (pr.status='converted' and exists(select 1 from public.purchase_orders pc join public.purchase_order_items pi on pi.order_id=pc.id and pi.company_id=c
       where pc.company_id=c and pc.request_id=pr.id and pc.status in('draft','issued','confirmed','partially_received') and pi.product_id=x.component->>'product_id' and pi.unit=x.component->>'unit'
        and pi.quantity>coalesce((select sum(rec.quantity) from public.purchase_receipt_items rec join public.purchase_receipts receipt on receipt.id=rec.receipt_id and receipt.company_id=c where rec.item_id=pi.id and rec.company_id=c and receipt.reversed_at is null),0))))
    order by pr.created_at desc limit 1;
   if not found then
    result:=public.purchase_command(p_operation_id,'request_save',jsonb_build_object('reason','Material para Pedido '||o.number,'priority','high','notes','Origem: componente de '||i.product_name,
     'items',jsonb_build_array(jsonb_build_object('product_id',x.component->>'product_id','description',x.component->>'name','unit',x.component->>'unit','quantity',qty))));
   end if;
  elsif p_action='ot_save' then
   if o.status not in ('producao','impressao','acabamento') then raise exception 'Pedido não está em produção.' using errcode='22023';end if;
   if t.id is not null and t.status<>'draft' then raise exception 'Somente rascunho pode alterar especificação e fornecedor.' using errcode='22023';end if;
   select * into q from public.production_queue where company_id=c and order_id=o.id and order_item_id=i.id;
   if not found or q.status not in ('fila','producao','impressao','acabamento') then raise exception 'Produção indisponível ou concluída.' using errcode='22023';end if;
   select * into s from public.suppliers where company_id=c and id=p_payload->>'supplier_id' and active;
   if not found then raise exception 'Fornecedor ativo da empresa é obrigatório.' using errcode='22023';end if;
   key:=nullif(p_payload->>'component_id','')::uuid;component:='{}';qty:=(p_payload->>'quantity')::numeric;
   if key is not null then
    select z.component,z.required into component,qty from private.component_requirements(i) z where z.component->>'id'=key::text and (z.component->>'is_outsourced')::boolean;
    if not found then raise exception 'Componente terceirizado indisponível no snapshot do Pedido.' using errcode='22023';end if;
   end if;
   if qty is null or qty<=0 or qty<>round(qty,6) or qty>1000000 or (p_payload->>'freight')::numeric<>round((p_payload->>'freight')::numeric,2) or
    (p_payload->>'unit_cost')::numeric<>round((p_payload->>'unit_cost')::numeric,4) then raise exception 'Quantidade e valores fora da precisão permitida.' using errcode='22023';end if;
   if length(btrim(coalesce(p_payload->>'title',''))) not between 1 and 300 or length(coalesce(p_payload->>'unit','')) not between 1 and 30 then raise exception 'Informe descrição e unidade.' using errcode='22023';end if;
   if t.id is null then
    insert into private.outsourcing_counters(company_id,last_number) values(c,1) on conflict(company_id) do update set last_number=private.outsourcing_counters.last_number+1 returning last_number into number;
   else number:=t.number;end if;
   insert into public.outsourcing_orders(id,company_id,number,order_id,order_item_id,production_id,supplier_id,component_id,scope_key,supplier_snapshot,technical_snapshot,title,specification,quantity,unit,due_date,
    estimated_unit_cost,estimated_cost,freight,dependent,notes,actor)
   values(coalesce(t.id,gen_random_uuid()),c,number,o.id,i.id,q.id,s.id,key,coalesce(key::text,'whole'),jsonb_build_object('name',s.name),
    jsonb_build_object('order_number',o.number,'product_name',i.product_name,'details',jsonb_build_object('width',i.details->'width','height',i.details->'height','length',i.details->'length','configuration_summary',i.details->'configuration_summary'),'component',component),p_payload->>'title',coalesce(p_payload->>'specification',''),qty,
    coalesce(component->>'unit',p_payload->>'unit'),(p_payload->>'due_date')::date,(p_payload->>'unit_cost')::numeric,round(qty*(p_payload->>'unit_cost')::numeric,2),coalesce((p_payload->>'freight')::numeric,0),
    (key is not null or coalesce((p_payload->>'dependent')::boolean,true)),coalesce(p_payload->>'notes',''),auth.uid())
   on conflict(id) do update set supplier_id=excluded.supplier_id,supplier_snapshot=excluded.supplier_snapshot,component_id=excluded.component_id,scope_key=excluded.scope_key,technical_snapshot=excluded.technical_snapshot,title=excluded.title,specification=excluded.specification,
    due_date=excluded.due_date,quantity=excluded.quantity,unit=excluded.unit,estimated_unit_cost=excluded.estimated_unit_cost,estimated_cost=excluded.estimated_cost,freight=excluded.freight,dependent=excluded.dependent,notes=excluded.notes,updated_at=clock_timestamp()
   returning * into t;
   perform private.composite_audit(c,'outsourcing_order.'||case when p_payload->>'id' is null then 'created' else 'updated' end,'outsourcing_orders',t.id::text,to_jsonb(t),p_operation_id);
  elsif p_action='ot_transition' then
   target:=p_payload->>'status';
   if target='issued' and t.status='draft' then null;
   elsif target='confirmed' and t.status='issued' then null;
   elsif target='in_progress' and t.status='sent' then null;
   elsif target='cancelled' and t.status<>'cancelled' then
    if exists(select 1 from public.outsourcing_receipts where outsourcing_id=t.id and reversed_at is null) or (t.materials_sent and t.dispatched_at is not null and t.returned_at is null) or
     (t.purchase_order_id is not null and exists(select 1 from public.purchase_orders where id=t.purchase_order_id and status<>'cancelled')) then raise exception 'Reverta recebimentos, registre retorno de materiais e cancele a Compra antes de cancelar a OT.' using errcode='22023';end if;
   else raise exception 'Transição de terceirização inválida.' using errcode='22023';end if;
   update public.outsourcing_orders set status=target,updated_at=clock_timestamp() where id=t.id returning * into t;
   perform private.composite_audit(c,'outsourcing_order.'||target,'outsourcing_orders',t.id::text,jsonb_build_object('status',target),p_operation_id);
  elsif p_action='ot_dispatch' then
   if t.status<>'confirmed' or t.dispatched_at is not null then raise exception 'Somente OT confirmada e não enviada pode registrar envio.' using errcode='22023';end if;
   if coalesce((p_payload->>'materials_sent')::boolean,false) and not exists(select 1 from public.component_consumptions z join public.component_consumption_items v on v.consumption_id=z.id where z.company_id=c and z.order_item_id=i.id and z.reversed_at is null and v.physical) then raise exception 'Registre o consumo físico antes de declarar materiais enviados.' using errcode='22023';end if;
   if coalesce((p_payload->>'materials_sent')::boolean,false) and length(btrim(coalesce(p_payload->>'notes','')))<5 then raise exception 'Descreva os materiais e quantidades enviados.' using errcode='22023';end if;
   update public.outsourcing_orders set status='sent',materials_sent=coalesce((p_payload->>'materials_sent')::boolean,false),dispatched_at=clock_timestamp(),dispatch_notes=left(coalesce(p_payload->>'notes',''),3000),updated_at=clock_timestamp() where id=t.id returning * into t;
   perform private.composite_audit(c,'outsourcing_order.sent','outsourcing_orders',t.id::text,jsonb_build_object('materials_sent',t.materials_sent,'notes',t.dispatch_notes),p_operation_id);
  elsif p_action='ot_receive' then
   if t.status not in ('sent','in_progress','partial') or t.returned_at is not null then raise exception 'OT deve estar enviada ou em execução.' using errcode='22023';end if;
   qty:=(p_payload->>'quantity')::numeric;received_on:=(p_payload->>'received_date')::date;
   select coalesce(sum(quantity),0) into received from public.outsourcing_receipts where company_id=c and outsourcing_id=t.id and reversed_at is null;
   if qty is null or qty<=0 or qty<>round(qty,6) or qty>t.quantity-received then raise exception 'Quantidade excede o saldo da OT.' using errcode='22023';end if;
   if received_on is null or received_on<t.ordered_date or received_on>(now() at time zone 'America/Bahia')::date then raise exception 'Data de recebimento inválida.' using errcode='22023';end if;
   insert into public.outsourcing_receipts(company_id,outsourcing_id,quantity,received_date,quality,notes,actor) values(c,t.id,qty,received_on,p_payload->>'quality',coalesce(p_payload->>'notes',''),auth.uid()) returning * into r;
   perform private.outsourcing_update_receipt_state(c,t.id);
   perform private.composite_audit(c,'outsourcing_order.received','outsourcing_receipts',r.id::text,to_jsonb(r),p_operation_id);
   result:=jsonb_build_object('receipt_id',r.id);
  elsif p_action='ot_receipt_reverse' then
   if t.purchase_order_id is not null and exists(select 1 from public.purchase_orders where id=t.purchase_order_id and status<>'cancelled') then raise exception 'Cancele a Compra canônica antes de reverter recebimento da OT.' using errcode='22023';end if;
   if q.status in ('concluido','expedicao','entregue','finalizado') then raise exception 'Reabra a Produção antes de reverter a terceirização.' using errcode='22023';end if;
   if exists(select 1 from public.production_queue where id=t.production_id and status in ('concluido','expedicao','entregue','finalizado')) then raise exception 'Reabra a Produção antes de reverter a terceirização.' using errcode='22023';end if;
   if length(btrim(coalesce(p_payload->>'reason',''))) not between 5 and 2000 then raise exception 'Informe o motivo da reversão.' using errcode='22023';end if;
   update public.outsourcing_receipts set reversed_at=clock_timestamp(),reversed_by=auth.uid(),reversal_reason=p_payload->>'reason' where company_id=c and outsourcing_id=t.id and id=(p_payload->>'receipt_id')::uuid and reversed_at is null returning * into r;
   if not found then raise exception 'Recebimento indisponível ou já revertido.' using errcode='40001';end if;
   perform private.outsourcing_update_receipt_state(c,t.id);
   perform private.composite_audit(c,'outsourcing_order.receipt_reversed','outsourcing_receipts',r.id::text,jsonb_build_object('reason',r.reversal_reason,'outsourcing_id',t.id),p_operation_id);
  elsif p_action='ot_return' then
   if not t.materials_sent or t.dispatched_at is null or t.returned_at is not null or exists(select 1 from public.outsourcing_receipts where outsourcing_id=t.id and reversed_at is null) or length(btrim(coalesce(p_payload->>'reason','')))<5 then raise exception 'Retorno exige materiais enviados, sem recebimento ativo, e motivo explícito.' using errcode='22023';end if;
   update public.outsourcing_orders set returned_at=clock_timestamp(),return_notes=left(p_payload->>'reason',2000),updated_at=clock_timestamp() where id=t.id returning * into t;
   perform private.composite_audit(c,'outsourcing_order.materials_returned','outsourcing_orders',t.id::text,jsonb_build_object('reason',t.return_notes),p_operation_id);
  elsif p_action='ot_cost' then
   if t.status<>'received' or t.purchase_order_id is not null then raise exception 'Custo real exige OT recebida e sem Compra vinculada; corrija obrigações no fluxo canônico.' using errcode='22023';end if;
   qty:=(p_payload->>'actual_cost')::numeric;
   if qty is null or qty<0 or qty<>round(qty,2) or qty>9999999999 or length(btrim(coalesce(p_payload->>'reason','')))<5 then raise exception 'Informe custo real válido e motivo.' using errcode='22023';end if;
   update public.outsourcing_orders set actual_cost=qty,updated_at=clock_timestamp() where id=t.id returning * into t;
   perform private.composite_audit(c,'outsourcing_order.cost_updated','outsourcing_orders',t.id::text,jsonb_build_object('actual_cost',qty,'reason',p_payload->>'reason'),p_operation_id);
  elsif p_action='ot_purchase' then
   if t.status<>'received' or t.actual_cost is null or t.actual_cost+t.freight<=0 or t.purchase_order_id is not null then raise exception 'Compra exige OT recebida, custo real positivo e nenhum vínculo anterior.' using errcode='22023';end if;
   result:=public.purchase_command(p_operation_id,'order_save',jsonb_build_object('supplier_id',t.supplier_id,'ordered_date',(now() at time zone 'America/Bahia')::date,'expected_date',t.due_date,
    'notes','Serviço da OT-'||lpad(t.number::text,4,'0')||' · Pedido '||o.number,'payment_terms','Uma obrigação de serviço; pagamento no Financeiro','freight',t.freight,'discount',0,'expenses',0,
    'items',jsonb_build_array(jsonb_build_object('product_id',null,'description',t.title||' · OT-'||lpad(t.number::text,4,'0'),'unit','servico','quantity',1,'unit_price',t.actual_cost)),
    'installments',jsonb_build_array(jsonb_build_object('amount',t.actual_cost+t.freight,'due_date',p_payload->>'due_date'))));
   update public.outsourcing_orders set purchase_order_id=(result->>'id')::uuid,updated_at=clock_timestamp() where id=t.id returning * into t;
   perform private.composite_audit(c,'outsourcing_order.purchase_linked','outsourcing_orders',t.id::text,jsonb_build_object('purchase_order_id',t.purchase_order_id),p_operation_id);
  else raise exception 'Comando desconhecido.' using errcode='22023';end if;
  if t.id is not null then result:=result||jsonb_build_object('id',t.id);end if;
 end if;
 result:=result||jsonb_build_object('company_id',c);
 insert into private.composite_commands(company_id,operation_id,actor,action,payload,result) values(c,p_operation_id,auth.uid(),p_action,p_payload,result);
 return result;
end $$;

create or replace function public.composite_source(p_from date default null,p_to date default null,p_item text default null,p_reports boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c text:=private.current_company_id();start_day date:=coalesce(p_from,(now() at time zone 'America/Bahia')::date-365);end_day date:=coalesce(p_to,(now() at time zone 'America/Bahia')::date);begin
 if auth.uid() is null or c is null or not(private.composite_allowed('/products') or private.composite_allowed('/production') or private.composite_allowed('/outsourcing')) then raise exception 'Sem permissão para consultar composições/terceirização.' using errcode='42501';end if;
 if p_reports then
  if not private.composite_allowed('/reports') then raise exception 'Sem permissão para Relatórios.' using errcode='42501';end if;
  perform private.saas_assert_read(c,'reports');
 end if;
 if end_day<start_day or end_day-start_day>366 then raise exception 'Período deve conter até 366 dias.' using errcode='22023';end if;
 return jsonb_build_object('company_id',c,'permissions',jsonb_build_object('products',private.composite_allowed('/products'),'production',private.composite_allowed('/production'),
 'outsourcing',private.composite_allowed('/outsourcing'),'approve',private.composite_allowed('/outsourcing/approve'),'receive',private.composite_allowed('/outsourcing/receive'),'reports',private.composite_allowed('/reports'),
 'stock',private.purchase_allowed('/stock'),'purchases',private.purchase_allowed('/purchases'),'finance',private.finance_can_access()),
 'company',(select jsonb_build_object('id',id,'name',name,'document',document,'email',email,'phone',phone,'street',street,'number',number,'neighborhood',neighborhood,'city',city,'state',state,'cep',cep) from public.companies where id=c),
 'products',coalesce((select jsonb_agg(case when private.composite_allowed('/products') then to_jsonb(p) else jsonb_build_object('id',p.id,'company_id',c,'name',p.name,'pricing_type',p.pricing_type,'inventory_unit',p.inventory_unit,'structure_type',p.structure_type,'active',p.active,'stock_controlled',p.stock_controlled,'current_stock',p.current_stock,'min_stock',p.min_stock,'updated_at',p.updated_at) end order by p.name) from public.products p where company_id=c),'[]'),
 'components',coalesce((select jsonb_agg(to_jsonb(b) order by product_id,sort_order) from public.product_components b where company_id=c and private.composite_allowed('/products')),'[]'),
 'suppliers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active) order by name) from public.suppliers where company_id=c),'[]'),
 'supplier_links',coalesce((select jsonb_agg(to_jsonb(b)) from public.supplier_products b where company_id=c and (private.purchase_allowed('/purchases') or private.purchase_allowed('/suppliers'))),'[]'),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'order_id',i.order_id,'product_id',i.product_id,'product_name',i.product_name,'quantity',i.quantity,'structure_type',i.structure_type,
  'details',jsonb_build_object('width',i.details->'width','height',i.details->'height','length',i.details->'length','optional_component_ids',i.details->'optional_component_ids'),
  'component_snapshot',private.component_snapshot_for_reader(i.id),'order_number',o.number,'order_status',o.status,'order_updated_at',o.updated_at,'company_id',c,
  'requirements',coalesce((select jsonb_agg(z.component||jsonb_build_object('required',z.required,'available',p.current_stock,'shortage',case when (z.component->>'stock_controlled')::boolean then greatest(0,z.required-p.current_stock) else 0 end))
   from private.component_requirements(i) z join public.products p on p.id=z.component->>'product_id' and p.company_id=c
   where private.composite_allowed('/products') or private.composite_allowed('/production') or (z.component->>'is_outsourced')::boolean),'[]')) order by o.created_at desc,i.id)
  from public.order_items i join public.orders o on o.id=i.order_id where o.company_id=c and (private.composite_allowed('/production') or private.composite_allowed('/outsourcing'))
   and ((o.created_at at time zone 'America/Bahia')::date between start_day and end_day or i.id=p_item
    or (o.status<>'cancelado' and exists(select 1 from public.production_queue pending where pending.order_item_id=i.id and pending.company_id=c and pending.status not in('concluido','expedicao','entregue','finalizado')))
    or exists(select 1 from public.component_consumptions history where history.order_item_id=i.id and history.company_id=c and (history.created_at at time zone 'America/Bahia')::date between start_day and end_day))),'[]'),
 'production',coalesce((select jsonb_agg(to_jsonb(q)) from public.production_queue q where company_id=c and (private.composite_allowed('/production') or private.composite_allowed('/outsourcing'))),'[]'),
 'consumptions',coalesce((select jsonb_agg(to_jsonb(v) order by created_at desc) from public.component_consumptions v where company_id=c and (private.composite_allowed('/production') or private.purchase_allowed('/stock'))),'[]'),
 'consumption_items',coalesce((select jsonb_agg(to_jsonb(v)) from public.component_consumption_items v where company_id=c and (private.composite_allowed('/production') or private.purchase_allowed('/stock'))),'[]'),
 'orders',coalesce((select jsonb_agg(to_jsonb(t) order by created_at desc) from public.outsourcing_orders t where company_id=c and private.composite_allowed('/outsourcing') and (ordered_date between start_day and end_day or order_item_id=p_item)),'[]'),
 'receipts',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc) from public.outsourcing_receipts r where company_id=c and private.composite_allowed('/outsourcing')),'[]'),
 'dependencies',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'order_item_id',t.order_item_id,'component_id',t.component_id,'number',t.number,'status',t.status,'due_date',t.due_date,'dependent',t.dependent,'quantity',t.quantity,'received',coalesce((select sum(quantity) from public.outsourcing_receipts where outsourcing_id=t.id and reversed_at is null),0))) from public.outsourcing_orders t where company_id=c and private.composite_allowed('/production')),'[]'),
 'purchases',case when private.purchase_allowed('/purchases') then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'number',p.number,'status',p.status,'total',p.total)) from public.purchase_orders p where p.company_id=c and exists(select 1 from public.outsourcing_orders t where t.company_id=c and t.purchase_order_id=p.id)),'[]') else '[]'::jsonb end,
 'movements',coalesce((select jsonb_agg(to_jsonb(m)) from(select * from public.stock_movements where company_id=c and private.purchase_allowed('/stock') order by created_at desc limit 1000)m),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e)) from(select id,action,entity_id,actor_name,created_at,new_values from public.audit_logs where company_id=c and
  ((private.composite_allowed('/products') and (action like 'product_component.%' or action like 'product_composition.%')) or
   (private.composite_allowed('/production') and action like 'component.%') or (private.composite_allowed('/outsourcing') and action like 'outsourcing_order.%')) order by created_at desc limit 500)e),'[]'));
end $$;
