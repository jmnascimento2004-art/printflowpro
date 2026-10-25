-- One-level product structure and operational outsourcing; existing ledgers remain canonical.
alter table public.products
 add column structure_type text not null default 'simple' check(structure_type in ('simple','composite','kit')),
 add column inventory_unit text check(inventory_unit in ('unidade','m2','linear','kg','l')),
 alter column current_stock type numeric(18,6),
 alter column min_stock type numeric(18,6);
alter table public.stock_movements alter column quantity type numeric(18,6);
alter table public.supplier_products alter column minimum_quantity type numeric(18,6);
alter table public.purchase_request_items alter column quantity type numeric(18,6);
alter table public.purchase_order_items alter column quantity type numeric(18,6);
alter table public.purchase_receipt_items alter column quantity type numeric(18,6);
-- Store customers legitimately SELECT order_items(*). Internal costs/suppliers
-- therefore belong in a private snapshot, never in a newly exposed item column.
alter table public.order_items add column structure_type text not null default 'simple' check(structure_type in ('simple','composite','kit'));
create table private.order_component_snapshots(
 order_item_id text primary key references public.order_items(id) on delete cascade deferrable initially deferred,
 company_id text not null references public.companies(id),snapshot jsonb not null
);
create index order_component_snapshot_tenant on private.order_component_snapshots(company_id);
create index order_component_snapshot_parts on private.order_component_snapshots using gin((snapshot->'components') jsonb_path_ops);
alter table private.order_component_snapshots enable row level security;
revoke all on private.order_component_snapshots from public,anon,authenticated;
create function private.item_component_snapshot(p_id text) returns jsonb language sql security definer set search_path='' as $$
 select coalesce((select snapshot from private.order_component_snapshots where order_item_id=p_id),'{}'::jsonb)
$$;
revoke all on function private.item_component_snapshot(text) from public,anon,authenticated;
create function private.component_snapshot_for_reader(p_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb:=private.item_component_snapshot(p_id);begin
 if private.composite_allowed('/products') or private.composite_allowed('/production') then return snapshot;end if;
 return jsonb_build_object('type',snapshot->>'type','product_name',snapshot->>'product_name','components',coalesce((select jsonb_agg(v) from jsonb_array_elements(coalesce(snapshot->'components','[]')) v where (v->>'is_outsourced')::boolean),'[]'));
end $$;
revoke all on function private.component_snapshot_for_reader(text) from public,anon,authenticated;
alter table public.orders add constraint composite_order_tenant unique(company_id,id);
alter table public.order_items add constraint composite_item_order unique(order_id,id);
alter table public.production_queue add constraint outsourcing_production_tenant unique(company_id,id);

create function private.product_inventory_unit(p public.products) returns text
language sql immutable set search_path='' as $$ select coalesce(p.inventory_unit,p.pricing_type) $$;
revoke all on function private.product_inventory_unit(public.products) from public,anon,authenticated;

create table public.product_components(
 id uuid primary key default gen_random_uuid(),company_id text not null references public.companies(id),
 product_id text not null,component_product_id text not null,
 component_type text not null check(component_type in ('material','product','internal_service','labor','machine','outsourced_service')),
 quantity numeric(18,6) not null check(quantity>0 and quantity<=1000000),unit text not null,
 basis text not null default 'unit' check(basis in ('unit','area','length','perimeter')),
 waste_percent numeric(8,4) not null default 0 check(waste_percent between 0 and 1000),
 is_optional boolean not null default false,is_outsourced boolean not null default false,
 preferred_supplier_id text,lead_days integer not null default 0 check(lead_days between 0 and 3650),
 notes text not null default '' check(length(notes)<=2000),sort_order integer not null default 0,
 foreign key(company_id,product_id) references public.products(company_id,id),
 foreign key(company_id,component_product_id) references public.products(company_id,id),
 foreign key(company_id,preferred_supplier_id) references public.suppliers(company_id,id),
 check(product_id<>component_product_id),unique(company_id,product_id,component_product_id),unique(company_id,id)
);
create index component_child_lookup on public.product_components(company_id,component_product_id);
create index component_supplier_lookup on public.product_components(company_id,preferred_supplier_id);

create table public.component_consumptions(
 id uuid primary key default gen_random_uuid(),company_id text not null references public.companies(id),
 order_id text not null,order_item_id text not null,actor uuid not null,
 created_at timestamptz not null default now(),reversed_at timestamptz,reversed_by uuid,reversal_reason text,
 foreign key(company_id,order_id) references public.orders(company_id,id),
 foreign key(order_id,order_item_id) references public.order_items(order_id,id),unique(company_id,id)
);
create unique index component_consumption_active_once on public.component_consumptions(company_id,order_item_id) where reversed_at is null;
create index component_consumption_order on public.component_consumptions(company_id,order_id);
create index component_consumption_item on public.component_consumptions(order_id,order_item_id);
create table public.component_consumption_items(
 id uuid primary key default gen_random_uuid(),company_id text not null,consumption_id uuid not null,product_id text not null,
 description text not null,unit text not null,quantity numeric(18,6) not null check(quantity>0),
 unit_cost numeric(16,6) not null check(unit_cost>=0),physical boolean not null,
 stock_movement_id text unique references public.stock_movements(id),reversal_movement_id text unique references public.stock_movements(id),
 foreign key(company_id,consumption_id) references public.component_consumptions(company_id,id),
 foreign key(company_id,product_id) references public.products(company_id,id),unique(consumption_id,product_id)
);
create index component_consumption_product on public.component_consumption_items(company_id,product_id);

create table public.outsourcing_orders(
 id uuid primary key default gen_random_uuid(),company_id text not null references public.companies(id),number bigint not null,
 order_id text not null,order_item_id text not null,production_id text not null,supplier_id text not null,
 component_id uuid,scope_key text not null,supplier_snapshot jsonb not null,technical_snapshot jsonb not null,
 title text not null check(length(title) between 1 and 300),specification text not null default '' check(length(specification)<=5000),
 quantity numeric(18,6) not null check(quantity>0 and quantity<=1000000),unit text not null,
 due_date date not null,ordered_date date not null default (now() at time zone 'America/Bahia')::date,
 status text not null default 'draft' check(status in ('draft','issued','confirmed','sent','in_progress','partial','received','cancelled')),
 estimated_unit_cost numeric(14,4) not null check(estimated_unit_cost>=0),estimated_cost numeric(14,2) not null check(estimated_cost>=0),
 freight numeric(14,2) not null default 0 check(freight>=0),actual_cost numeric(14,2) check(actual_cost>=0),
 dependent boolean not null default true,materials_sent boolean not null default false,
 dispatched_at timestamptz,dispatch_notes text not null default '',returned_at timestamptz,return_notes text,
 notes text not null default '' check(length(notes)<=3000),purchase_order_id uuid unique,
 actor uuid not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(company_id,order_id) references public.orders(company_id,id),
 foreign key(order_id,order_item_id) references public.order_items(order_id,id),
 foreign key(company_id,production_id) references public.production_queue(company_id,id),
 foreign key(company_id,supplier_id) references public.suppliers(company_id,id),
 foreign key(company_id,purchase_order_id) references public.purchase_orders(company_id,id),unique(company_id,id),unique(company_id,number)
);
create unique index outsourcing_scope_active on public.outsourcing_orders(company_id,order_item_id,scope_key) where status<>'cancelled';
create index outsourcing_order_lookup on public.outsourcing_orders(company_id,order_id);
create index outsourcing_item_lookup on public.outsourcing_orders(order_id,order_item_id);
create index outsourcing_production_lookup on public.outsourcing_orders(company_id,production_id);
create index outsourcing_supplier_due on public.outsourcing_orders(company_id,supplier_id,due_date);
create index outsourcing_status_due on public.outsourcing_orders(company_id,status,due_date);
create index outsourcing_purchase_lookup on public.outsourcing_orders(company_id,purchase_order_id);
create table public.outsourcing_receipts(
 id uuid primary key default gen_random_uuid(),company_id text not null,outsourcing_id uuid not null,
 quantity numeric(18,6) not null check(quantity>0),received_date date not null,
 quality text not null check(quality in ('accepted','with_reservations')),
 notes text not null default '' check(length(notes)<=3000),actor uuid not null,created_at timestamptz not null default now(),
 reversed_at timestamptz,reversed_by uuid,reversal_reason text,
 foreign key(company_id,outsourcing_id) references public.outsourcing_orders(company_id,id)
);
create index outsourcing_receipt_lookup on public.outsourcing_receipts(company_id,outsourcing_id);
create table private.composite_commands(company_id text not null,operation_id uuid not null,actor uuid not null,action text not null,payload jsonb not null,result jsonb not null,primary key(company_id,operation_id));
create index composite_shortage_request on private.composite_commands(company_id,(payload->>'order_item_id'),(payload->>'product_id')) where action='purchase_request';
create table private.outsourcing_counters(company_id text primary key references public.companies(id),last_number bigint not null default 0);
alter table private.composite_commands enable row level security;
alter table private.outsourcing_counters enable row level security;
revoke all on private.composite_commands,private.outsourcing_counters from public,anon,authenticated;

create function private.composite_allowed(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select p.role=any(coalesce(r.roles,case p_path
 when '/products' then array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']
 when '/production' then array['admin','gerente','producao','arte_finalista']
 when '/outsourcing' then array['admin','gerente','financeiro','producao','estoque']
 when '/outsourcing/approve' then array['admin','gerente','financeiro','producao']
 when '/outsourcing/receive' then array['admin','gerente','producao','estoque']
 when '/reports' then array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']
 else array[]::text[] end)) from public.profiles p left join public.role_permissions r on r.company_id=p.company_id and r.path=p_path
 where p.auth_user_id=(select auth.uid()) and p.active order by p.id limit 1),false)
$$;
revoke all on function private.composite_allowed(text) from public,anon;
grant execute on function private.composite_allowed(text) to authenticated;
do $$ declare t text;path text;begin foreach t in array array['product_components','component_consumptions','component_consumption_items','outsourcing_orders','outsourcing_receipts'] loop
 path:=case when t='product_components' then '/products' when t like 'component_consumption%' then '/production' else '/outsourcing' end;
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy composite_read on public.%I for select to authenticated using(company_id=(select private.current_company_id()) and (select private.composite_allowed(%L)))',t,path);
 execute format('create trigger saas_billing_write_guard before insert or update or delete on public.%I for each row execute function private.saas_write_guard()',t);
 end loop;end $$;

-- The existing public stock command and the sale-authorized kit engine share this core.
-- It has no client EXECUTE grant and never derives authority from a supplied tenant.
create function private.move_inventory(c text,p_id text,q numeric,kind text,reason text,cost numeric) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype;m public.stock_movements%rowtype;begin
 if q is null or q<=0 or q<>round(q,6) or q>999999999999 or kind not in ('entrada','saida') then return jsonb_build_object('status','INVALID_INPUT');end if;
 select * into p from public.products where company_id=c and id=p_id for update;
 if not found then return jsonb_build_object('status','NOT_FOUND');end if;
 if p.current_stock+(case when kind='entrada' then q else -q end)<0 then return jsonb_build_object('status','INSUFFICIENT_STOCK');end if;
 update public.products set current_stock=current_stock+case when kind='entrada' then q else -q end where id=p.id returning * into p;
 insert into public.stock_movements(company_id,product_id,product_name,type,quantity,reason,unit_cost)
 values(c,p.id,p.name,kind,q,reason,coalesce(cost,p.base_cost,0)) returning * into m;
 return jsonb_build_object('status','UPDATED','product',to_jsonb(p),'movement',to_jsonb(m));
end $$;
revoke all on function private.move_inventory(text,text,numeric,text,text,numeric) from public,anon,authenticated;
create or replace function public.adjust_inventory_stock(p_product_id text,p_quantity numeric,p_type text,p_reason text,p_unit_cost numeric default null,p_expected_updated_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c text:=private.current_company_id();p public.products%rowtype;begin
 if auth.uid() is null or c is null or not private.current_user_can_access_path('/stock') then return jsonb_build_object('status','NOT_AUTHORIZED');end if;
 select * into p from public.products where id=p_product_id and company_id=c for update;
 if not found then return jsonb_build_object('status','NOT_FOUND');end if;
 if p_expected_updated_at is not null and p.updated_at is distinct from p_expected_updated_at then return jsonb_build_object('status','CONFLICT','product',to_jsonb(p));end if;
 return private.move_inventory(c,p.id,p_quantity,p_type,nullif(btrim(p_reason),''),p_unit_cost);
end $$;

-- SQL authority for the existing Phase6 cost-composition contract, not a sale-price engine.
create function private.product_reference_cost(p public.products) returns numeric language plpgsql immutable set search_path='' as $$
declare x jsonb;n numeric:=0;q numeric;v numeric;begin
 if coalesce(p.pricing_details#>>'{cost_composition,mode}','manual')<>'composition' then return p.base_cost;end if;
 for x in select value from jsonb_array_elements(coalesce(p.pricing_details#>'{cost_composition,components}','[]')) loop
  if coalesce((x->>'active')::boolean,false) then
   q:=(x->>'quantity')::numeric;v:=(x->>'unit_cost')::numeric;
   if q is null or v is null or q<0 or v<0 or q>1000000000 or v>1000000000 then raise exception 'Custo de componente inválido.' using errcode='22023';end if;
   n:=n+q*v;
  end if;
 end loop;
 return round(n,2);
end $$;
revoke all on function private.product_reference_cost(public.products) from public,anon,authenticated;

create function private.composite_audit(c text,action text,entity text,entity_id text,data jsonb,op uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare a public.profiles%rowtype;begin
 select * into a from public.profiles where auth_user_id=auth.uid() and company_id=c and active order by id limit 1;
 insert into public.audit_logs(company_id,actor_user_id,actor_profile_id,actor_name,actor_role,action,entity_type,entity_id,module,new_values,metadata)
 values(c,auth.uid(),a.id,coalesce(a.name,'SYSTEM'),coalesce(a.role,'system'),action,entity,entity_id,
 case when action like 'product_component.%' then 'products' else 'production' end,data,jsonb_build_object('operation_id',op));
end $$;
revoke all on function private.composite_audit(text,text,text,text,jsonb,uuid) from public,anon,authenticated;

create function private.component_snapshot_for(p public.products) returns jsonb language plpgsql security definer set search_path='' as $$
declare components jsonb;begin
 if p.structure_type='simple' then return '{}';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'product_id',b.component_product_id,'name',child.name,
 'kind',b.component_type,'quantity',b.quantity,'unit',b.unit,'basis',b.basis,'waste_percent',b.waste_percent,
 'is_optional',b.is_optional,'is_outsourced',b.is_outsourced,'stock_controlled',child.stock_controlled,
 'unit_cost',private.product_reference_cost(child),'preferred_supplier_id',b.preferred_supplier_id,'lead_days',b.lead_days,'notes',b.notes)
 order by b.sort_order,b.id),'[]') into components from public.product_components b
 join public.products child on child.company_id=b.company_id and child.id=b.component_product_id
 where b.company_id=p.company_id and b.product_id=p.id;
 if jsonb_array_length(components)=0 then raise exception 'Produto composto ou kit precisa de componentes.' using errcode='22023';end if;
 return jsonb_build_object('version',1,'type',p.structure_type,'product_id',p.id,'product_name',p.name,'revision',p.updated_at,
 'components',components,'reference_cost',private.product_reference_cost(p));
end $$;
revoke all on function private.component_snapshot_for(public.products) from public,anon,authenticated;

create function private.component_item_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype;previous public.order_items%rowtype;c text;parent text;locked boolean;begin
 parent:=case when tg_op='DELETE' then old.order_id else new.order_id end;
 select company_id into c from public.orders where id=parent;
 if c is null or (current_setting('role',true) in ('authenticated','anon') and auth.uid() is not null and c is distinct from private.current_company_id()) then raise exception 'Pedido indisponível.' using errcode='42501';end if;
 begin
  perform 1 from public.orders where id=parent and company_id=c for update nowait;
 exception when lock_not_available then raise exception 'Pedido em outra operação. Atualize e tente novamente.' using errcode='40001';end;
 if tg_op='DELETE' then
  if exists(select 1 from public.component_consumptions where order_item_id=old.id) or exists(select 1 from public.outsourcing_orders where order_item_id=old.id) then
   raise exception 'Item possui histórico de consumo ou terceirização; preserve e cancele o Pedido.' using errcode='22023';end if;
  return old;
 end if;
 if tg_op='INSERT' then
  -- INSERT candidates in the canonical UPSERT must not recalculate an existing snapshot.
  select * into previous from public.order_items where id=new.id;
  if found then
   if previous.order_id<>new.order_id then raise exception 'Item pertence a outro Pedido.' using errcode='22023';end if;
   new.structure_type:=previous.structure_type;return new;
  end if;
 else
  if new.order_id<>old.order_id then raise exception 'Item não pode mudar de Pedido.' using errcode='22023';end if;
  locked:=exists(select 1 from public.component_consumptions where order_item_id=old.id) or exists(select 1 from public.outsourcing_orders where order_item_id=old.id);
  if locked and jsonb_build_array(new.product_id,new.quantity,new.details->'width',new.details->'height',new.details->'length',new.details->'optional_component_ids')
   is distinct from jsonb_build_array(old.product_id,old.quantity,old.details->'width',old.details->'height',old.details->'length',old.details->'optional_component_ids') then
   raise exception 'Item com histórico operacional preserva produto, medidas, quantidade e opcionais. Crie outra linha para uma nova operação.' using errcode='22023';end if;
  if new.product_id is not distinct from old.product_id then new.structure_type:=old.structure_type;perform 1 from private.component_requirements(new);return new;end if;
 end if;
 select * into p from public.products where id=new.product_id and company_id=c for share;
 if not found then
  if exists(select 1 from public.products where id=new.product_id) then raise exception 'Produto indisponível.' using errcode='42501';end if;
  new.structure_type:='simple';
  if tg_op='UPDATE' then delete from private.order_component_snapshots where order_item_id=new.id;end if;
  return new;
 end if;
 new.structure_type:=p.structure_type;
 if tg_op='UPDATE' then
  delete from private.order_component_snapshots where order_item_id=new.id;
  if p.structure_type<>'simple' then insert into private.order_component_snapshots(order_item_id,company_id,snapshot) values(new.id,c,private.component_snapshot_for(p));end if;
  perform 1 from private.component_requirements(new);
 end if;
 return new;
end $$;
revoke all on function private.component_item_guard() from public,anon,authenticated;
create trigger composite_item_snapshot before insert or update or delete on public.order_items for each row execute function private.component_item_guard();
create function private.capture_component_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype;c text;begin
 if new.structure_type='simple' then return new;end if;
 select company_id into c from public.orders where id=new.order_id;
 select * into strict p from public.products where id=new.product_id and company_id=c;
 insert into private.order_component_snapshots(order_item_id,company_id,snapshot) values(new.id,c,private.component_snapshot_for(p));
 perform 1 from private.component_requirements(new);return new;
end $$;
revoke all on function private.capture_component_snapshot() from public,anon,authenticated;
create trigger composite_capture_snapshot after insert on public.order_items for each row execute function private.capture_component_snapshot();

create function private.component_requirements(i public.order_items) returns table(component jsonb,required numeric)
language plpgsql stable security definer set search_path='' as $$
declare x jsonb;factor numeric;w numeric;h numeric;l numeric;q numeric;begin
 if coalesce(private.item_component_snapshot(i.id)->>'type','simple')='simple' then return;end if;
 if i.quantity is null or i.quantity<=0 or i.quantity>1000000 then raise exception 'Quantidade do Pedido inválida.' using errcode='22023';end if;
 for x in select value from jsonb_array_elements(coalesce(private.item_component_snapshot(i.id)->'components','[]')) loop
  if (x->>'is_optional')::boolean and not coalesce(i.details->'optional_component_ids','[]') ? (x->>'id') then continue;end if;
  if x->>'basis'='unit' then factor:=1;
  else
   w:=coalesce(nullif(i.details->>'width','')::numeric,0);h:=coalesce(nullif(i.details->>'height','')::numeric,0);
   l:=coalesce(nullif(i.details->>'length','')::numeric,w);
   if w<0 or h<0 or l<0 or w>10000 or h>10000 or l>10000 then raise exception 'Medidas reais inválidas.' using errcode='22023';end if;
   factor:=case x->>'basis' when 'area' then w*h when 'length' then l when 'perimeter' then 2*(w+h) else 0 end;
   if factor<=0 or (x->>'basis'='perimeter' and (w=0 or h=0)) then raise exception 'Informe as medidas reais do item, em metros, para calcular os componentes.' using errcode='22023';end if;
  end if;
  q:=round(i.quantity*factor*(x->>'quantity')::numeric*(1+(x->>'waste_percent')::numeric/100),6);
  if q<=0 or q>999999999999 then raise exception 'Quantidade física fora do limite de precisão.' using errcode='22023';end if;
  component:=x;required:=q;return next;
 end loop;
end $$;
revoke all on function private.component_requirements(public.order_items) from public,anon,authenticated;

grant execute on function private.product_inventory_unit(public.products) to authenticated;
create function private.component_product_referenced(p_id text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.products p where p.id=p_id and p.company_id=private.current_company_id() and
  (exists(select 1 from public.product_components where component_product_id=p.id)
   or exists(select 1 from private.order_component_snapshots s where s.company_id=p.company_id and s.snapshot->'components' @> jsonb_build_array(jsonb_build_object('product_id',p.id)))))
$$;
revoke all on function private.component_product_referenced(text) from public,anon;
grant execute on function private.component_product_referenced(text) to authenticated;
create function private.component_product_has_history(p_id text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.products p where p.id=p_id and p.company_id=private.current_company_id() and
  (exists(select 1 from public.stock_movements where product_id=p.id) or exists(select 1 from public.product_components where component_product_id=p.id)
   or exists(select 1 from private.order_component_snapshots s where s.company_id=p.company_id and s.snapshot->'components' @> jsonb_build_array(jsonb_build_object('product_id',p.id)))))
$$;
revoke all on function private.component_product_has_history(text) from public,anon;
grant execute on function private.component_product_has_history(text) to authenticated;
create function private.composite_product_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then
  if private.component_product_referenced(old.id) then raise exception 'Componente possui histórico; inative o cadastro para preservá-lo.' using errcode='22023';end if;
  return old;
 end if;
 if tg_op='INSERT' then
  if current_user in ('anon','authenticated') and new.structure_type<>'simple' then raise exception 'Crie a estrutura pelo gerenciador de composição.' using errcode='42501';end if;
  return new;
 end if;
 if current_user in ('anon','authenticated') and new.structure_type is distinct from old.structure_type then raise exception 'Gerencie a estrutura pela composição do produto.' using errcode='42501';end if;
 if current_user in ('anon','authenticated') and old.structure_type<>'simple' and
  (new.base_cost is distinct from old.base_cost or new.pricing_details->'cost_composition' is distinct from old.pricing_details->'cost_composition') then
  raise exception 'Gerencie o custo composto pela composição do produto.' using errcode='22023';end if;
 if private.product_inventory_unit(new) is distinct from private.product_inventory_unit(old) and
  (old.current_stock<>0 or private.component_product_has_history(old.id)) then
  raise exception 'Unidade física possui histórico ou composição vinculada; não faça conversão implícita.' using errcode='22023';end if;
 if new.stock_controlled is distinct from old.stock_controlled and private.component_product_referenced(old.id) then raise exception 'Controle físico usado em composição não pode mudar implicitamente.' using errcode='22023';end if;
 if new.structure_type<>'simple' and (new.stock_controlled or new.current_stock<>0) then raise exception 'Composto e kit virtual não possuem estoque próprio nesta versão.' using errcode='22023';end if;
 return new;
end $$;
revoke all on function private.composite_product_guard() from public,anon,authenticated;
create trigger composite_product_guard before insert or update or delete on public.products for each row execute function private.composite_product_guard();

create function private.consume_components(c text,i public.order_items,strict_stock boolean default true) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing uuid;consumption uuid;x record;p public.products%rowtype;stock jsonb;needs jsonb;begin
 select id into existing from public.component_consumptions where company_id=c and order_item_id=i.id and reversed_at is null;
 if found then return existing;end if;
 select coalesce(jsonb_agg(jsonb_build_object('product_id',component->>'product_id','name',component->>'name','unit',component->>'unit',
 'physical',(component->>'stock_controlled')::boolean,'quantity',required,'unit_cost',(component->>'unit_cost')::numeric)),'[]') into needs
 from private.component_requirements(i) where not(component->>'is_outsourced')::boolean;
 -- Lock all material rows in one global order before inspecting any balance.
 perform 1 from public.products where company_id=c and id in(select v->>'product_id' from jsonb_array_elements(needs) v) order by id for update;
 for x in select v from jsonb_array_elements(needs) v loop
  select * into p from public.products where company_id=c and id=x.v->>'product_id';
  if not found or private.product_inventory_unit(p) is distinct from x.v->>'unit' or p.stock_controlled is distinct from (x.v->>'physical')::boolean then
   if strict_stock then raise exception 'Controle ou unidade do componente mudou; confira o histórico.' using errcode='22023';else return null;end if;
  end if;
  if p.stock_controlled and p.current_stock<(x.v->>'quantity')::numeric then
   if strict_stock then raise exception 'Estoque insuficiente: %. Necessário %, disponível %, faltante %.',p.name,x.v->>'quantity',p.current_stock,(x.v->>'quantity')::numeric-p.current_stock using errcode='22023';else return null;end if;
  end if;
 end loop;
 insert into public.component_consumptions(company_id,order_id,order_item_id,actor) values(c,i.order_id,i.id,auth.uid()) returning id into consumption;
 for x in select v from jsonb_array_elements(needs) v order by v->>'product_id' loop
  stock:=null;
  if (x.v->>'physical')::boolean then
   stock:=private.move_inventory(c,x.v->>'product_id',(x.v->>'quantity')::numeric,'saida','Consumo de componentes · '||consumption,(x.v->>'unit_cost')::numeric);
   if stock->>'status'<>'UPDATED' then raise exception 'Falha ao registrar consumo físico.' using errcode='22023';end if;
  end if;
  insert into public.component_consumption_items(company_id,consumption_id,product_id,description,unit,quantity,unit_cost,physical,stock_movement_id)
  values(c,consumption,x.v->>'product_id',x.v->>'name',x.v->>'unit',(x.v->>'quantity')::numeric,(x.v->>'unit_cost')::numeric,(x.v->>'physical')::boolean,stock#>>'{movement,id}');
 end loop;
 perform private.composite_audit(c,'component.consumed','component_consumptions',consumption::text,jsonb_build_object('order_id',i.order_id,'order_item_id',i.id,'items',needs));
 return consumption;
end $$;
revoke all on function private.consume_components(text,public.order_items,boolean) from public,anon,authenticated;
-- Guest checkout/payment automation can have no interactive actor; its trusted sale remains auditable.
alter table public.component_consumptions alter column actor drop not null;

create function private.try_consume_kits(o public.orders) returns void language plpgsql security definer set search_path='' as $$
declare i public.order_items%rowtype;begin
 if o.status not in ('producao','impressao','acabamento') then return;end if;
 perform 1 from public.products p where p.company_id=o.company_id and p.id in(
  select z.component->>'product_id' from public.order_items v cross join lateral private.component_requirements(v) z
  where v.order_id=o.id and v.structure_type='kit' and not(z.component->>'is_outsourced')::boolean
 ) order by p.id for update;
 for i in select * from public.order_items v where order_id=o.id and structure_type='kit'
  and not exists(select 1 from public.component_consumptions z where z.company_id=o.company_id and z.order_item_id=v.id) order by id loop
  -- A recorded payment remains recorded if material is missing. Production shows
  -- a pending consumption and cannot finish; no negative/partial stock is posted.
  perform private.consume_components(o.company_id,i,false);
 end loop;
end $$;
revoke all on function private.try_consume_kits(public.orders) from public,anon,authenticated;

create function private.assert_component_ready(c text,p_item text) returns void language plpgsql security definer set search_path='' as $$
declare i public.order_items%rowtype;x record;done numeric;begin
 select v.* into i from public.order_items v join public.orders o on o.id=v.order_id where o.company_id=c and v.id=p_item;
 if not found then raise exception 'Item indisponível.' using errcode='P0002';end if;
 if i.structure_type<>'simple' and not exists(select 1 from public.component_consumptions where company_id=c and order_item_id=i.id and reversed_at is null) then
   raise exception 'Registre o consumo/execução dos componentes antes de concluir.' using errcode='22023';end if;
  for x in select * from private.component_requirements(i) where (component->>'is_outsourced')::boolean loop
   select coalesce(sum(r.quantity),0) into done from public.outsourcing_orders t join public.outsourcing_receipts r on r.company_id=t.company_id and r.outsourcing_id=t.id
   where t.company_id=c and t.order_item_id=i.id and t.component_id=(x.component->>'id')::uuid and t.status<>'cancelled' and r.reversed_at is null;
   if done<x.required then raise exception 'Terceirização pendente: %. Necessário %, recebido %.',x.component->>'name',x.required,done using errcode='22023';end if;
  end loop;
  if exists(select 1 from public.outsourcing_orders where company_id=c and order_item_id=i.id and dependent and status not in ('received','cancelled')) then raise exception 'Etapa depende de uma terceirização ainda não recebida.' using errcode='22023';end if;
end $$;
revoke all on function private.assert_component_ready(text,text) from public,anon,authenticated;
create function private.composite_queue_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;begin
 select * into o from public.orders where id=new.order_id and company_id=new.company_id for update;
 if tg_op='INSERT' and o.status in ('producao','impressao','acabamento') then perform private.try_consume_kits(o);end if;
 if new.status in ('concluido','expedicao','entregue','finalizado') then perform private.assert_component_ready(o.company_id,new.order_item_id);end if;
 return new;
end $$;
revoke all on function private.composite_queue_guard() from public,anon,authenticated;
create trigger composite_queue_guard before insert or update of status on public.production_queue for each row execute function private.composite_queue_guard();

create function private.composite_order_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare x record;begin
 if new.status='cancelado' and old.status is distinct from new.status and
  (exists(select 1 from public.component_consumptions where company_id=new.company_id and order_id=new.id and reversed_at is null) or
   exists(select 1 from public.outsourcing_orders where company_id=new.company_id and order_id=new.id and status<>'cancelled')) then
  raise exception 'Reverta os consumos físicos e encerre as terceirizações antes de cancelar o Pedido.' using errcode='22023';end if;
 if new.status in ('expedicao','entregue','finalizado') and old.status is distinct from new.status then
  for x in select id from public.order_items where order_id=new.id loop perform private.assert_component_ready(new.company_id,x.id);end loop;
 end if;return new;
end $$;
revoke all on function private.composite_order_guard() from public,anon,authenticated;
create trigger composite_order_guard before update of status on public.orders for each row execute function private.composite_order_guard();
create function private.composite_order_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare current_order public.orders%rowtype;x record;begin
 select * into current_order from public.orders where id=new.id and company_id=new.company_id;
 if not found then return new;end if;
 if current_order.status in ('expedicao','entregue','finalizado') then
  for x in select id from public.order_items where order_id=current_order.id loop perform private.assert_component_ready(current_order.company_id,x.id);end loop;
 elsif tg_op='INSERT' or new.status is distinct from old.status or new.paid_amount>old.paid_amount then perform private.try_consume_kits(current_order);
 end if;return new;
end $$;
revoke all on function private.composite_order_changed() from public,anon,authenticated;
create constraint trigger composite_order_changed after insert or update on public.orders deferrable initially deferred for each row execute function private.composite_order_changed();

create function private.save_product_components(c text,payload jsonb,op uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype;child public.products%rowtype;b public.product_components%rowtype;old_b public.product_components%rowtype;
 x jsonb;kind text:=payload->>'structure_type';keep uuid[]:='{}';parts jsonb:='[]';costs jsonb;price_details jsonb;key uuid;position integer:=0;begin
 perform pg_advisory_xact_lock(hashtextextended('bom-definition:'||c,0));
 select * into p from public.products where id=payload->>'product_id' and company_id=c for update;
 if not found then raise exception 'Produto indisponível.' using errcode='P0002';end if;
 if p.updated_at is distinct from (payload->>'updated_at')::timestamptz then raise exception 'Produto atualizado por outra pessoa.' using errcode='40001';end if;
 if kind is null or kind not in ('simple','composite','kit') or jsonb_typeof(payload->'components') is distinct from 'array' then raise exception 'Estrutura ou componentes inválidos.' using errcode='22023';end if;
 if jsonb_array_length(payload->'components')>100 or (kind<>'simple' and jsonb_array_length(payload->'components')=0) or (kind='simple' and jsonb_array_length(payload->'components')<>0) then raise exception 'Informe de 1 a 100 componentes para composto/kit; simples não possui estrutura.' using errcode='22023';end if;
 if kind<>'simple' and (p.current_stock<>0 or exists(select 1 from public.product_components where company_id=c and component_product_id=p.id)) then raise exception 'Composição de um nível: regularize estoque próprio e não transforme um componente em estrutura aninhada.' using errcode='22023';end if;
 -- Serialize unit/control/cost edits of every child before validating or projecting it.
 perform 1 from public.products child_lock where child_lock.company_id=c
  and child_lock.id in (select value->>'component_product_id' from jsonb_array_elements(payload->'components'))
  order by child_lock.id for update;
 for x in select value from jsonb_array_elements(payload->'components') loop
  if x->>'component_product_id'=p.id then raise exception 'Produto não pode ser componente de si mesmo.' using errcode='22023';end if;
  select * into child from public.products where company_id=c and id=x->>'component_product_id' and active;
  if not found or child.structure_type<>'simple' then raise exception 'Componente deve ser produto/insumo/serviço ativo da empresa, sem estrutura aninhada.' using errcode='22023';end if;
  if x->>'unit' is distinct from private.product_inventory_unit(child) then raise exception 'Unidade deve ser a unidade física canônica; não há conversão implícita.' using errcode='22023';end if;
  if kind='kit' and (x->>'basis'<>'unit' or coalesce((x->>'is_optional')::boolean,false)) then raise exception 'Kit virtual possui composição fixa por unidade; opcionais pertencem à composição produtiva.' using errcode='22023';end if;
  if coalesce((x->>'is_outsourced')::boolean,false) and child.stock_controlled then raise exception 'Etapa terceirizada deve referenciar serviço sem estoque físico.' using errcode='22023';end if;
  if nullif(x->>'preferred_supplier_id','') is not null and not exists(select 1 from public.suppliers where company_id=c and id=x->>'preferred_supplier_id' and active) then raise exception 'Fornecedor preferencial indisponível.' using errcode='22023';end if;
  key:=coalesce(nullif(x->>'id','')::uuid,gen_random_uuid());position:=position+1;
  select * into old_b from public.product_components where id=key;
  insert into public.product_components(id,company_id,product_id,component_product_id,component_type,quantity,unit,basis,waste_percent,is_optional,is_outsourced,preferred_supplier_id,lead_days,notes,sort_order)
  values(key,c,p.id,child.id,case when coalesce((x->>'is_outsourced')::boolean,false) then 'outsourced_service' else x->>'component_type' end,
   (x->>'quantity')::numeric,x->>'unit',x->>'basis',coalesce((x->>'waste_percent')::numeric,0),coalesce((x->>'is_optional')::boolean,false),coalesce((x->>'is_outsourced')::boolean,false),
   nullif(x->>'preferred_supplier_id',''),coalesce((x->>'lead_days')::integer,0),coalesce(x->>'notes',''),position)
  on conflict(id) do update set component_product_id=excluded.component_product_id,component_type=excluded.component_type,quantity=excluded.quantity,unit=excluded.unit,basis=excluded.basis,
   waste_percent=excluded.waste_percent,is_optional=excluded.is_optional,is_outsourced=excluded.is_outsourced,preferred_supplier_id=excluded.preferred_supplier_id,lead_days=excluded.lead_days,notes=excluded.notes,sort_order=excluded.sort_order
  where public.product_components.company_id=c and public.product_components.product_id=p.id returning * into b;
  if not found then raise exception 'Componente indisponível para este produto.' using errcode='42501';end if;
  keep:=array_append(keep,key);
  if old_b.id is null or to_jsonb(old_b)<>to_jsonb(b) then perform private.composite_audit(c,case when old_b.id is null then 'product_component.added' else 'product_component.updated' end,'product_components',b.id::text,to_jsonb(b),op);end if;
  parts:=parts||jsonb_build_array(jsonb_build_object('id','bom:'||b.id,'description',child.name,'type',b.component_type,'quantity',b.quantity*(1+b.waste_percent/100),'unit',b.unit,
   'unit_cost',private.product_reference_cost(child),'supplier_id',b.preferred_supplier_id,'notes',b.notes,'active',not b.is_optional));
 end loop;
 for b in delete from public.product_components where company_id=c and product_id=p.id and not(id=any(keep)) returning * loop
  perform private.composite_audit(c,'product_component.removed','product_components',b.id::text,to_jsonb(b),op);
 end loop;
 select coalesce(jsonb_agg(v),'[]') into costs from jsonb_array_elements(coalesce(p.pricing_details#>'{cost_composition,components}','[]')) v where coalesce(v->>'id','') not like 'bom:%';
 price_details:=jsonb_set(coalesce(p.pricing_details,'{}'),'{cost_composition}',jsonb_build_object('version',1,'mode',case when kind='simple' then 'manual' else 'composition' end,'components',costs||parts));
 p.pricing_details:=price_details;
 update public.products set structure_type=kind,stock_controlled=case when kind='simple' then stock_controlled else false end,
  pricing_details=price_details,base_cost=case when kind='simple' then base_cost else private.product_reference_cost(p) end
 where id=p.id returning * into p;
 perform private.composite_audit(c,'product_composition.saved','products',p.id,jsonb_build_object('structure_type',kind,'reference_cost',p.base_cost),op);
 return jsonb_build_object('product',to_jsonb(p));
end $$;
revoke all on function private.save_product_components(text,jsonb,uuid) from public,anon,authenticated;

create function private.outsourcing_update_receipt_state(c text,ot uuid) returns void language plpgsql security definer set search_path='' as $$
declare received numeric;begin
 select coalesce(sum(quantity),0) into received from public.outsourcing_receipts where company_id=c and outsourcing_id=ot and reversed_at is null;
 update public.outsourcing_orders set status=case when received=0 then case when dispatched_at is not null then 'sent' else 'confirmed' end when received=quantity then 'received' else 'partial' end,updated_at=clock_timestamp() where company_id=c and id=ot;
end $$;
revoke all on function private.outsourcing_update_receipt_state(text,uuid) from public,anon,authenticated;

create function public.composite_command(p_operation_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c text:=private.current_company_id();memo private.composite_commands%rowtype;result jsonb:='{}';o public.orders%rowtype;i public.order_items%rowtype;
 t public.outsourcing_orders%rowtype;r public.outsourcing_receipts%rowtype;cons public.component_consumptions%rowtype;s public.suppliers%rowtype;q public.production_queue%rowtype;
 component jsonb;x record;stock jsonb;qty numeric;received numeric;number bigint;target text;received_on date;key uuid;parent_id text;begin
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
   if i.structure_type<>'composite' or jsonb_typeof(p_payload->'selected') is distinct from 'array' or exists(select 1 from public.component_consumptions where order_item_id=i.id) or exists(select 1 from public.outsourcing_orders where order_item_id=i.id) then raise exception 'Opcionais exigem composto sem histórico operacional.' using errcode='22023';end if;
   if exists(select 1 from jsonb_array_elements_text(p_payload->'selected') v where not exists(select 1 from jsonb_array_elements(private.item_component_snapshot(i.id)->'components') z where (z->>'is_optional')::boolean and z->>'id'=v)) then raise exception 'Componente opcional inválido.' using errcode='22023';end if;
   update public.order_items set details=jsonb_set(coalesce(details,'{}'),'{optional_component_ids}',p_payload->'selected') where id=i.id;
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
revoke all on function public.composite_command(uuid,text,jsonb) from public,anon;
grant execute on function public.composite_command(uuid,text,jsonb) to authenticated;

-- Preserve the purchasing implementation; change only physical-unit lookup and precision.
do $upgrade$ declare body text;begin
 body:=pg_get_functiondef('public.purchase_command(uuid,text,jsonb)'::regprocedure);
 if position('product.pricing_type' in body)=0 or position('round(v_qty,2)' in body)=0 then raise exception 'Purchasing contract changed; review physical-unit upgrade.';end if;
 body:=replace(body,'product.pricing_type','private.product_inventory_unit(product)');
 body:=replace(body,'round(v_qty,2)','round(v_qty,6)');
 execute body;
 body:=pg_get_functiondef('public.purchase_source(date,date,uuid)'::regprocedure);
 if position('''pricing_type'',pricing_type' in body)=0 then raise exception 'Purchasing source contract changed.';end if;
 body:=replace(body,'''pricing_type'',pricing_type','''pricing_type'',pricing_type,''inventory_unit'',inventory_unit');
 execute body;
end $upgrade$;

create function private.outsourcing_purchase_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare t public.outsourcing_orders%rowtype;begin
 select * into t from public.outsourcing_orders where company_id=new.company_id and purchase_order_id=new.id;
 if found and (new.total is distinct from t.actual_cost+t.freight or new.supplier_id is distinct from t.supplier_id) then
  raise exception 'Compra vinculada à OT preserva fornecedor e custo real contratado.' using errcode='22023';end if;
 return new;
end $$;
revoke all on function private.outsourcing_purchase_guard() from public,anon,authenticated;
create trigger outsourcing_purchase_guard before update of total,supplier_id on public.purchase_orders for each row execute function private.outsourcing_purchase_guard();
create function private.outsourcing_purchase_item_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.stock_controlled or new.product_id is not null) and exists(select 1 from public.outsourcing_orders where company_id=new.company_id and purchase_order_id=new.order_id) then
  raise exception 'Compra da OT é serviço contratado, sem entrada física de produto.' using errcode='22023';end if;return new;
end $$;
revoke all on function private.outsourcing_purchase_item_guard() from public,anon,authenticated;
create trigger outsourcing_purchase_item_guard before insert or update on public.purchase_order_items for each row execute function private.outsourcing_purchase_item_guard();

create function public.composite_source(p_from date default null,p_to date default null,p_item text default null,p_reports boolean default false) returns jsonb
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
  'component_snapshot',private.component_snapshot_for_reader(i.id),'order_number',o.number,'order_status',o.status,'company_id',c,
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
revoke all on function public.composite_source(date,date,text,boolean) from public,anon;
grant execute on function public.composite_source(date,date,text,boolean) to authenticated;
