-- Quality is an operational case, never another commercial Order or queue.
create table public.quality_nonconformities (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id), number bigint not null,
 source_type text not null check(source_type in('order','production','purchase','receipt','outsourcing','field_service')), source_id text not null,
 order_id text,order_item_id text,product_id text,production_id text,supplier_id text,purchase_id uuid,purchase_item_id uuid,receipt_id uuid,outsourcing_id uuid,service_id uuid,
 category text not null check(category in('production_error','wrong_material','print_defect','wrong_measure','color','finishing','damage','artwork','supplier','installation','other')),
 severity text not null check(severity in('low','medium','high','critical')),
 status text not null default 'open' check(status in('open','analysis','action_defined','rework','reinspection','closed','cancelled')),
 problem_origin text not null default 'undefined' check(problem_origin in('internal','supplier','customer','artwork','transport','installation','undefined')),
 description text not null check(length(btrim(description)) between 5 and 5000),root_cause text not null default '',analysis text not null default '',
 assigned_profile_id text references public.profiles(id),responsible_supplier_id text,team jsonb not null default '[]',
 source_snapshot jsonb not null,affected_quantity numeric(18,6),block_completion boolean not null default false,cost_applicable boolean not null default false,
 deadline_impact_days integer not null default 0 check(deadline_impact_days between 0 and 365),cycle integer not null default 1 check(cycle>0),action_id uuid,
 opened_at timestamptz not null default clock_timestamp(),closed_at timestamptz,created_by uuid not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id),unique(company_id,number),
 foreign key(company_id,order_id) references public.orders(company_id,id),foreign key(order_id,order_item_id) references public.order_items(order_id,id),
 foreign key(company_id,product_id) references public.products(company_id,id),foreign key(company_id,production_id) references public.production_queue(company_id,id),
 foreign key(company_id,supplier_id) references public.suppliers(company_id,id),foreign key(company_id,responsible_supplier_id) references public.suppliers(company_id,id),
 foreign key(company_id,purchase_id) references public.purchase_orders(company_id,id),foreign key(company_id,purchase_id,purchase_item_id) references public.purchase_order_items(company_id,order_id,id),foreign key(company_id,receipt_id) references public.purchase_receipts(company_id,id),
 foreign key(company_id,outsourcing_id) references public.outsourcing_orders(company_id,id),foreign key(company_id,service_id) references public.field_services(company_id,id),
 check(order_item_id is null or order_id is not null),check(affected_quantity is null or affected_quantity>0 and affected_quantity<=1000000),
 check(jsonb_typeof(team)='array' and jsonb_array_length(team)<=20),check(length(root_cause)<=5000 and length(analysis)<=5000)
);
create index quality_case_filter on public.quality_nonconformities(company_id,opened_at desc,status);
create index quality_case_severity on public.quality_nonconformities(company_id,severity,status);
create index quality_case_source on public.quality_nonconformities(company_id,source_type,source_id);
create index quality_case_order on public.quality_nonconformities(company_id,order_id);
create index quality_case_item on public.quality_nonconformities(order_id,order_item_id);
create index quality_case_product on public.quality_nonconformities(company_id,product_id);
create index quality_case_production on public.quality_nonconformities(company_id,production_id);
create index quality_case_supplier on public.quality_nonconformities(company_id,supplier_id);
create index quality_case_responsible_supplier on public.quality_nonconformities(company_id,responsible_supplier_id);
create index quality_case_purchase on public.quality_nonconformities(company_id,purchase_id);
create index quality_case_purchase_item on public.quality_nonconformities(company_id,purchase_id,purchase_item_id);
create index quality_case_receipt on public.quality_nonconformities(company_id,receipt_id);
create index quality_case_outsourcing on public.quality_nonconformities(company_id,outsourcing_id);
create index quality_case_service on public.quality_nonconformities(company_id,service_id);
create index quality_case_assignee on public.quality_nonconformities(assigned_profile_id);

create table public.quality_actions (
 id uuid primary key default gen_random_uuid(),company_id text not null,nc_id uuid not null,cycle integer not null,version integer not null,
 kind text not null check(kind in('rework','reproduction','substitution','supplier_return','adjustment','restricted_acceptance','no_action')),
 execution_mode text not null check(execution_mode in('internal','outsourced','field','none')),
 state text not null default 'planned' check(state in('planned','running','done','failed','superseded','cancelled')),
 quantity numeric(18,6) not null check(quantity>0 and quantity<=1000000),assigned_profile_id text references public.profiles(id),supplier_id text,
 due_date date,notes text not null check(length(btrim(notes)) between 5 and 5000),result text not null default '',acceptance text not null default '',invalidation_reason text not null default '' check(length(invalidation_reason)<=1000),
 requires_reinspection boolean not null default true,production_id text,production_run integer,production_before jsonb,
 outsourcing_id uuid,return_service_id uuid,return_run integer,execution_snapshot jsonb,started_at timestamptz,finished_at timestamptz,
 actor uuid not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id),unique(nc_id,version),unique(return_service_id,return_run),
 foreign key(company_id,nc_id) references public.quality_nonconformities(company_id,id),foreign key(company_id,supplier_id) references public.suppliers(company_id,id),
 foreign key(company_id,production_id) references public.production_queue(company_id,id),foreign key(company_id,outsourcing_id) references public.outsourcing_orders(company_id,id),
 foreign key(company_id,return_service_id) references public.field_services(company_id,id),check(length(result)<=5000 and length(acceptance)<=2000)
);
create index quality_action_case on public.quality_actions(company_id,nc_id);
create index quality_action_assignee on public.quality_actions(assigned_profile_id);
create index quality_action_supplier on public.quality_actions(company_id,supplier_id);
create index quality_action_production on public.quality_actions(company_id,production_id);
create index quality_action_ot on public.quality_actions(company_id,outsourcing_id);
create index quality_action_return on public.quality_actions(company_id,return_service_id);
alter table public.quality_nonconformities add constraint quality_current_action foreign key(company_id,action_id) references public.quality_actions(company_id,id);
create index quality_case_current_action on public.quality_nonconformities(company_id,action_id);

-- Append-only technical history for the existing canonical queue, not a second queue.
create table public.production_executions (
 id uuid primary key default gen_random_uuid(),company_id text not null,production_id text not null,execution_number integer not null,
 quality_action_id uuid,snapshot jsonb not null,actor uuid,recorded_at timestamptz not null default now(),
 foreign key(company_id,production_id) references public.production_queue(company_id,id),foreign key(company_id,quality_action_id) references public.quality_actions(company_id,id),
 unique(production_id,execution_number)
);
create index production_execution_scope on public.production_executions(company_id,production_id);
create index production_execution_quality on public.production_executions(company_id,quality_action_id);
alter table public.production_queue add column execution_number integer not null default 1 check(execution_number>0),add column quality_action_id uuid;
alter table public.production_queue add constraint production_quality_action foreign key(company_id,quality_action_id) references public.quality_actions(company_id,id);
create index production_quality_action_scope on public.production_queue(company_id,quality_action_id);

create table public.quality_materials (
 id uuid primary key default gen_random_uuid(),company_id text not null,nc_id uuid not null,action_id uuid not null,product_id text not null,
 description text not null,unit text not null,quantity numeric(18,6) not null check(quantity>0 and quantity<=1000000),unit_cost numeric(18,6) not null check(unit_cost between 0 and 1000000000),
 stock_movement_id text not null references public.stock_movements(id),reversal_movement_id text references public.stock_movements(id),
 actor uuid not null,created_at timestamptz not null default now(),reversed_at timestamptz,reversal_reason text,
 foreign key(company_id,nc_id) references public.quality_nonconformities(company_id,id),foreign key(company_id,action_id) references public.quality_actions(company_id,id),
 foreign key(company_id,product_id) references public.products(company_id,id)
);
create unique index quality_material_active_once on public.quality_materials(action_id,product_id) where reversed_at is null;
create index quality_material_case on public.quality_materials(company_id,nc_id);
create index quality_material_action on public.quality_materials(company_id,action_id);
create index quality_material_product on public.quality_materials(company_id,product_id);
create index quality_material_movement on public.quality_materials(stock_movement_id);
create index quality_material_reversal on public.quality_materials(reversal_movement_id);
create table public.quality_costs (
 id uuid primary key default gen_random_uuid(),company_id text not null,nc_id uuid not null,action_id uuid not null,
 kind text not null check(kind in('labor','machine','outsourcing','freight','field_service','other')),description text not null check(length(btrim(description)) between 2 and 300),
 planned numeric(14,2) not null default 0 check(planned between 0 and 9999999999),actual numeric(14,2) check(actual between 0 and 9999999999),
 outsourcing_id uuid,service_id uuid,service_run integer,financial_id text references public.financial_transactions(id),financial_history jsonb not null default '[]',
 actor uuid not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(financial_id),unique(company_id,id),
 foreign key(company_id,nc_id) references public.quality_nonconformities(company_id,id),foreign key(company_id,action_id) references public.quality_actions(company_id,id),
 foreign key(company_id,outsourcing_id) references public.outsourcing_orders(company_id,id),foreign key(company_id,service_id) references public.field_services(company_id,id),
 check(jsonb_typeof(financial_history)='array' and jsonb_array_length(financial_history)<=1000)
);
create unique index quality_cost_ot_once on public.quality_costs(outsourcing_id) where outsourcing_id is not null;
create unique index quality_cost_service_once on public.quality_costs(service_id,service_run) where service_id is not null;
create index quality_cost_case on public.quality_costs(company_id,nc_id);
create index quality_cost_action on public.quality_costs(company_id,action_id);
create index quality_cost_ot_scope on public.quality_costs(company_id,outsourcing_id);
create index quality_cost_service_scope on public.quality_costs(company_id,service_id);
create table public.quality_cost_history (
 id uuid primary key default gen_random_uuid(),company_id text not null,nc_id uuid not null,cost_id uuid not null,
 snapshot jsonb not null,actor uuid not null,created_at timestamptz not null default now(),
 foreign key(company_id,nc_id) references public.quality_nonconformities(company_id,id),foreign key(company_id,cost_id) references public.quality_costs(company_id,id)
);
create index quality_cost_history_case on public.quality_cost_history(company_id,nc_id);
create index quality_cost_history_cost on public.quality_cost_history(company_id,cost_id);
-- New field expenses identify their execution; legacy expenses remain unassigned,
-- rather than inventing a historical allocation. Existing service totals still sum all runs.
alter table public.field_service_costs add column run integer check(run>0);
create table private.quality_legacy_field_costs(cost_id uuid primary key,company_id text not null,last_existing_run integer not null check(last_existing_run>0));
insert into private.quality_legacy_field_costs select k.id,k.company_id,s.run from public.field_service_costs k join public.field_services s on s.company_id=k.company_id and s.id=k.service_id where k.run is null;
alter table private.quality_legacy_field_costs enable row level security;
revoke all on private.quality_legacy_field_costs from public,anon,authenticated;
do $$declare definition text;needle text;replacement text;begin
 definition:=pg_get_functiondef('public.field_service_command(uuid,text,jsonb)'::regprocedure);
 needle:='insert into public.field_service_costs(id,company_id,service_id,kind,description,planned,actual,outsourcing_id,financial_history)';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Qualidade: Inserção canônica de custo de campo divergente.';end if;
 definition:=replace(definition,needle,'insert into public.field_service_costs(id,company_id,service_id,kind,description,planned,actual,outsourcing_id,financial_history,run)');
 needle:='financial_history)';
 -- The value terminator is intentionally specific, not a generic money rewrite.
 needle:='(p_payload->>''outsourcing_id'')::uuid,financial_history)';replacement:='(p_payload->>''outsourcing_id'')::uuid,financial_history,case when cost.id is null then s.run else cost.run end)';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Qualidade: Valores canônicos de custo de campo divergentes.';end if;
 execute replace(definition,needle,replacement);
end$$;
create table public.quality_evidence (
 id uuid primary key default gen_random_uuid(),company_id text not null,nc_id uuid not null,cycle integer not null,
 state text not null default 'pending' check(state in('pending','ready','removed')),path text not null unique,sha256 text not null check(sha256~'^[0-9a-f]{64}$'),
 bytes integer not null check(bytes between 1 and 5242880),mime text not null check(mime in('image/jpeg','image/png')),caption text not null default '' check(length(caption)<=300),
 actor uuid not null,actor_name text not null,created_at timestamptz not null default now(),removed_at timestamptz,
 foreign key(company_id,nc_id) references public.quality_nonconformities(company_id,id)
);
create index quality_evidence_case on public.quality_evidence(company_id,nc_id,cycle);
create unique index quality_evidence_active_content on public.quality_evidence(nc_id,cycle,actor,sha256,caption) where state<>'removed';
create table public.quality_reinspections (
 id uuid primary key default gen_random_uuid(),company_id text not null,nc_id uuid not null,action_id uuid not null,cycle integer not null,
 result text not null check(result in('approved','rejected')),notes text not null check(length(btrim(notes)) between 5 and 5000),actor uuid not null,actor_name text not null,created_at timestamptz not null default now(),
 foreign key(company_id,nc_id) references public.quality_nonconformities(company_id,id),foreign key(company_id,action_id) references public.quality_actions(company_id,id),unique(action_id)
);
create index quality_reinspection_case on public.quality_reinspections(company_id,nc_id,created_at);
create index quality_reinspection_action on public.quality_reinspections(company_id,action_id);
create table public.quality_closures (
 id uuid primary key default gen_random_uuid(),company_id text not null,nc_id uuid not null,cycle integer not null,snapshot jsonb not null,cost_snapshot jsonb not null,
 actor uuid not null,closed_at timestamptz not null default now(),foreign key(company_id,nc_id) references public.quality_nonconformities(company_id,id),unique(nc_id,cycle)
);
create index quality_closure_case on public.quality_closures(company_id,nc_id);
create table public.quality_events (
 id uuid primary key default gen_random_uuid(),company_id text not null,nc_id uuid not null,action text not null,details jsonb not null default '{}',
 actor uuid not null,actor_name text not null,created_at timestamptz not null default now(),foreign key(company_id,nc_id) references public.quality_nonconformities(company_id,id)
);
create index quality_event_case on public.quality_events(company_id,nc_id,created_at);
create table private.quality_commands(company_id text not null,operation_id uuid not null,actor uuid not null,action text not null,payload jsonb not null,result jsonb not null,primary key(company_id,operation_id));
create table private.quality_counters(company_id text primary key references public.companies(id),number bigint not null);
create table private.quality_cost_salts(nc_id uuid primary key references public.quality_nonconformities(id),secret uuid not null default gen_random_uuid());
alter table private.quality_cost_salts enable row level security;
revoke all on private.quality_cost_salts from public,anon,authenticated;
-- Definer-only context, unlike a browser-spoofable session GUC.
create table private.quality_queue_context(backend integer not null,transaction bigint not null,action_id uuid not null,primary key(backend,transaction));
alter table private.quality_commands enable row level security;
alter table private.quality_counters enable row level security;
alter table private.quality_queue_context enable row level security;
revoke all on private.quality_commands,private.quality_counters,private.quality_queue_context from public,anon,authenticated;

create function private.quality_profile_allowed(c text,r text,path text) returns boolean language sql stable security definer set search_path='' as $$
 select r=any(coalesce((select roles from public.role_permissions where company_id=c and public.role_permissions.path=$3),case $3
 when '/quality' then array['admin','gerente','producao','arte_finalista','estoque','financeiro','vendas']
 when '/quality/open' then array['admin','gerente','producao','arte_finalista','estoque']
 when '/quality/execute' then array['admin','gerente','producao','arte_finalista','estoque']
 when '/quality/manage' then array['admin','gerente']
 when '/quality/close' then array['admin','gerente']
 when '/quality/reopen' then array['admin','gerente']
 when '/orders' then array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']
 when '/production' then array['admin','gerente','producao','arte_finalista'] else array[]::text[] end))
$$;
revoke all on function private.quality_profile_allowed(text,text,text) from public,anon,authenticated;
create function private.quality_allowed(path text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select private.quality_profile_allowed(company_id,role,$1) from public.profiles where auth_user_id=auth.uid() and active order by id limit 1),false)
$$;
revoke all on function private.quality_allowed(text) from public,anon;
grant execute on function private.quality_allowed(text) to authenticated;
create function private.quality_read(id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.quality_allowed('/quality') and exists(select 1 from public.quality_nonconformities n where n.id=$1 and n.company_id=private.current_company_id())
$$;
revoke all on function private.quality_read(uuid) from public,anon;
grant execute on function private.quality_read(uuid) to authenticated;
create function private.quality_finance() returns boolean language sql stable security definer set search_path='' as $$select private.quality_allowed('/quality') and private.finance_can_access()$$;
revoke all on function private.quality_finance() from public,anon;
grant execute on function private.quality_finance() to authenticated;
create function private.quality_reports(c text) returns boolean language plpgsql stable security definer set search_path='' as $$begin if not private.composite_allowed('/reports') then return false;end if;perform private.saas_assert_read(c,'reports');return true;exception when insufficient_privilege then return false;end$$;
revoke all on function private.quality_reports(text) from public,anon,authenticated;

do $$declare t text;begin foreach t in array array['quality_nonconformities','quality_actions','quality_materials','quality_costs','quality_evidence','quality_reinspections','quality_closures','quality_events','production_executions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy quality_tenant_read on public.%I for select to authenticated using(company_id=(select private.current_company_id()) and (select private.quality_allowed(''/quality'')))',t);
 if t<>'production_executions' then execute format('create trigger saas_billing_write_guard before insert or update or delete on public.%I for each row execute function private.saas_write_guard()',t);end if;
 end loop;end$$;
drop policy quality_tenant_read on public.quality_costs;
create policy quality_financial_read on public.quality_costs for select to authenticated using(company_id=(select private.current_company_id()) and (select private.quality_finance()));
alter table public.quality_cost_history enable row level security;
revoke all on public.quality_cost_history from public,anon,authenticated;
grant select on public.quality_cost_history to authenticated;
create policy quality_financial_read on public.quality_cost_history for select to authenticated using(company_id=(select private.current_company_id()) and (select private.quality_finance()));
create trigger saas_billing_write_guard before insert or update or delete on public.quality_cost_history for each row execute function private.saas_write_guard();
revoke select on public.quality_materials,public.quality_closures from authenticated;
grant select(id,company_id,nc_id,action_id,product_id,description,unit,quantity,stock_movement_id,reversal_movement_id,actor,created_at,reversed_at,reversal_reason) on public.quality_materials to authenticated;
grant select(id,company_id,nc_id,cycle,snapshot,actor,closed_at) on public.quality_closures to authenticated;

create function private.quality_item_physical(i public.order_items) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object('product_id',i.product_id,'manual_name',case when i.product_id is null then i.product_name end,'quantity',i.quantity,'structure_type',i.structure_type,'outsourced',i.outsourced,'supplier_id',i.supplier_id,
  'width',i.details->'width','height',i.details->'height','length',i.details->'length','variant',i.details->'variant','color',i.details->'color','configuration_summary',i.details->'configuration_summary',
  'optional_component_ids',i.details->'optional_component_ids','custom_fields',i.details#>'{pricing_snapshot,custom_fields}',
  'configuration_snapshot',case when jsonb_typeof(i.details->'configuration_snapshot')='object' then (i.details->'configuration_snapshot')-array['unit_price','total_price','production_time','production_time_source'] end,
  'selected_options',(select coalesce(jsonb_agg(case when jsonb_typeof(v)='object' then v-array['price_delta','additional_days'] else v end order by v->>'group_id',v->>'name',v->>'option_name'),'[]') from jsonb_array_elements(case when jsonb_typeof(i.details->'selected_options')='array' then i.details->'selected_options' else '[]'::jsonb end)v)))
$$;
revoke all on function private.quality_item_physical(public.order_items) from public,anon,authenticated;

create function private.quality_origin(c text,kind text,reference text,item_ref text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;i public.order_items%rowtype;q public.production_queue%rowtype;pc public.purchase_orders%rowtype;
 rec public.purchase_receipts%rowtype;pi public.purchase_order_items%rowtype;ot public.outsourcing_orders%rowtype;fs public.field_services%rowtype;
 supplier_name text;qty numeric;label text;begin
 if kind='order' then
  if not private.quality_allowed('/orders') then raise exception 'Sem permissão para a origem Pedido.' using errcode='42501';end if;
  select * into o from public.orders where company_id=c and id=reference;
  if item_ref is not null then select * into i from public.order_items where order_id=o.id and id=item_ref;if not found then raise exception 'Qualidade: Item não pertence ao Pedido.' using errcode='22023';end if;end if;
 elsif kind='production' then
  if not private.quality_allowed('/production') then raise exception 'Sem permissão para a origem Produção.' using errcode='42501';end if;
  select * into q from public.production_queue where company_id=c and id=reference;
  select * into o from public.orders where company_id=c and id=q.order_id;select * into i from public.order_items where order_id=o.id and id=q.order_item_id;
 elsif kind in('purchase','receipt') then
  if not private.purchase_allowed('/purchases') then raise exception 'Sem permissão para a origem Compra.' using errcode='42501';end if;
  if kind='receipt' then select * into rec from public.purchase_receipts where company_id=c and id=reference::uuid;end if;
  select * into pc from public.purchase_orders where company_id=c and id=case when kind='receipt' then rec.order_id else reference::uuid end;
  if item_ref is not null then
   select * into pi from public.purchase_order_items where company_id=c and order_id=pc.id and id=item_ref::uuid;
   if not found or kind='receipt' and not exists(select 1 from public.purchase_receipt_items where company_id=c and receipt_id=rec.id and item_id=pi.id) then raise exception 'Qualidade: Item não pertence à Compra/recebimento.' using errcode='22023';end if;
  end if;
 elsif kind='outsourcing' then
  if not private.composite_allowed('/outsourcing') then raise exception 'Sem permissão para a origem OT.' using errcode='42501';end if;
  select * into ot from public.outsourcing_orders where company_id=c and id=reference::uuid;
  select * into o from public.orders where company_id=c and id=ot.order_id;select * into i from public.order_items where order_id=o.id and id=ot.order_item_id;
  select * into q from public.production_queue where company_id=c and id=ot.production_id;
  select * into pc from public.purchase_orders where company_id=c and id=ot.purchase_order_id;
 elsif kind='field_service' then
  if not private.fs_can_read(reference::uuid) then raise exception 'Sem permissão para a origem Serviço Externo.' using errcode='42501';end if;
  select * into fs from public.field_services where company_id=c and id=reference::uuid;
  select * into o from public.orders where company_id=c and id=fs.order_id;select * into i from public.order_items where order_id=o.id and id=fs.order_item_id;
  select * into q from public.production_queue where company_id=c and id=fs.production_id;
 else raise exception 'Qualidade: Origem inválida.' using errcode='22023';end if;
 if (kind='order' and o.id is null) or (kind='production' and q.id is null) or (kind='purchase' and pc.id is null) or (kind='receipt' and rec.id is null) or (kind='outsourcing' and ot.id is null) or (kind='field_service' and fs.id is null) then raise exception 'Qualidade: Origem indisponível para sua empresa.' using errcode='P0002';end if;
 if kind='field_service' and i.id is null and item_ref is not null then select * into i from public.order_items where order_id=o.id and id=item_ref;if not found then raise exception 'Qualidade: Item não pertence ao Serviço/Pedido.' using errcode='22023';end if;end if;
 if item_ref is not null and kind not in('purchase','receipt') and i.id is distinct from item_ref then raise exception 'Qualidade: Item não pertence à origem.' using errcode='22023';end if;
 if q.id is null and i.id is not null then select * into q from public.production_queue where company_id=c and order_id=o.id and order_item_id=i.id;end if;
 select name into supplier_name from public.suppliers where company_id=c and id=coalesce(ot.supplier_id,pc.supplier_id);
 qty:=case when ot.id is not null then ot.quantity when kind='production' then q.quantity when rec.id is not null then (select sum(quantity) from public.purchase_receipt_items where company_id=c and receipt_id=rec.id and (pi.id is null or item_id=pi.id)) when pi.id is not null then pi.quantity when pc.id is not null then (select sum(quantity) from public.purchase_order_items where company_id=c and order_id=pc.id) when i.id is not null then i.quantity else (select sum(quantity) from public.order_items where order_id=o.id) end;
 label:=case kind when 'order' then o.number when 'production' then o.number||' · '||q.product_name when 'purchase' then 'PC-'||lpad(pc.number::text,4,'0') when 'receipt' then 'Recebimento PC-'||lpad(pc.number::text,4,'0') when 'outsourcing' then 'OT-'||lpad(ot.number::text,4,'0') when 'field_service' then 'SE-'||lpad(fs.number::text,4,'0') end;
 return jsonb_build_object('source_type',kind,'source_id',reference,'version',case kind when 'order' then o.updated_at when 'production' then q.updated_at when 'purchase' then pc.updated_at when 'receipt' then coalesce(rec.reversed_at,rec.created_at) when 'outsourcing' then ot.updated_at when 'field_service' then fs.updated_at end,'order_id',o.id,'order_item_id',i.id,'product_id',coalesce(i.product_id,pi.product_id),'production_id',q.id,'supplier_id',coalesce(ot.supplier_id,pc.supplier_id),'purchase_id',pc.id,'purchase_item_id',pi.id,'receipt_id',rec.id,'outsourcing_id',ot.id,'service_id',fs.id,'quantity',coalesce(qty,1),
  'snapshot',jsonb_build_object('label',label,'order_number',o.number,'customer_name',o.customer_name,'item_name',coalesce(i.product_name,pi.description),'supplier_name',supplier_name,'original_quantity',coalesce(qty,1),'order_deadline',o.deadline,
   'details',jsonb_build_object('width',i.details->'width','height',i.details->'height','length',i.details->'length','configuration_summary',i.details->'configuration_summary','optional_component_ids',i.details->'optional_component_ids'),
   'components',case when i.id is null then '[]'::jsonb else (select coalesce(jsonb_agg(v-'unit_cost'),'[]') from jsonb_array_elements(coalesce(private.item_component_snapshot(i.id)->'components','[]')) v) end,
   'production',case when q.id is not null then jsonb_build_object('id',q.id,'status',q.status,'execution_number',q.execution_number,'quantity',q.quantity) end,
   'purchase',case when pc.id is not null then jsonb_build_object('id',pc.id,'number',pc.number,'status',pc.status,'receipt_id',rec.id,'received_at',rec.created_at,'item_id',pi.id) end,
   'outsourcing',case when ot.id is not null then jsonb_build_object('id',ot.id,'number',ot.number,'title',ot.title,'quantity',ot.quantity,'status',ot.status) end,
   'service',case when fs.id is not null then jsonb_build_object('id',fs.id,'number',fs.number,'run',fs.run,'status',fs.status,'order_item_id',fs.order_item_id,'address',fs.address_snapshot,'assigned_profile_id',fs.assigned_profile_id,'team',fs.team) end));
end$$;
revoke all on function private.quality_origin(text,text,text,text) from public,anon,authenticated;

create function private.quality_actor_valid(c text,profile_id text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where company_id=c and id=profile_id and active and auth_user_id is not null)
$$;
revoke all on function private.quality_actor_valid(text,text) from public,anon,authenticated;
create function private.quality_can_execute(n public.quality_nonconformities) returns boolean language sql stable security definer set search_path='' as $$
 select private.quality_allowed('/quality/manage') or private.quality_allowed('/quality/execute') and exists(select 1 from public.profiles p where p.company_id=n.company_id and p.auth_user_id=auth.uid() and p.active and (n.assigned_profile_id=p.id or n.team?p.id or exists(select 1 from public.quality_actions where id=n.action_id and assigned_profile_id=p.id)))
$$;
revoke all on function private.quality_can_execute(public.quality_nonconformities) from public,anon,authenticated;
create function private.quality_audit(n public.quality_nonconformities,action text,details jsonb,op uuid,p_actor uuid default auth.uid()) returns void language plpgsql security definer set search_path='' as $$
declare a public.profiles%rowtype;begin
 select * into a from public.profiles where auth_user_id=p_actor and company_id=n.company_id and active order by id limit 1;
 if a.id is null then raise exception 'Sem permissão atual.' using errcode='42501';end if;
 insert into public.quality_events(company_id,nc_id,action,details,actor,actor_name) values(n.company_id,n.id,action,jsonb_build_object('record',to_jsonb(n)-'source_snapshot','corrective_action',(select to_jsonb(t) from public.quality_actions t where id=n.action_id))||details,p_actor,a.name);
 insert into public.audit_logs(company_id,actor_user_id,actor_profile_id,actor_name,actor_role,action,entity_type,entity_id,module,new_values,metadata)
 values(n.company_id,p_actor,a.id,a.name,a.role,'quality.'||action,'quality_nonconformities',n.id::text,'quality',jsonb_build_object('number',n.number,'order_id',n.order_id,'cycle',n.cycle)||details,jsonb_build_object('operation_id',op));
end$$;
revoke all on function private.quality_audit(public.quality_nonconformities,text,jsonb,uuid,uuid) from public,anon,authenticated;

create function private.quality_authorized(action text,n public.quality_nonconformities) returns boolean language sql stable security definer set search_path='' as $$
 select private.quality_allowed('/quality') and case
 when action='create' then private.quality_allowed('/quality/open')
 when action='close' then private.quality_allowed('/quality/close')
 when action='reopen' then private.quality_allowed('/quality/reopen')
 when action in('cost_save','cost_export','cost_cancel') then private.quality_finance()
 when action in('update','analyze','action_define','cancel','action_cancel','action_invalidate','file_remove') then private.quality_allowed('/quality/manage')
 when action='reinspect' then private.quality_allowed('/quality/close')
 when action='file_reserve' then private.quality_can_execute(n) or private.quality_allowed('/quality/open') and n.created_by=auth.uid()
 when action in('action_start','action_finish','material_consume','material_reverse','field_return') then private.quality_can_execute(n)
 else false end
$$;
revoke all on function private.quality_authorized(text,public.quality_nonconformities) from public,anon,authenticated;

create function private.quality_cost_actual(k public.quality_costs) returns numeric language plpgsql stable security definer set search_path='' as $$
declare value numeric;begin
 if k.kind='outsourcing' then select actual_cost+freight into value from public.outsourcing_orders where company_id=k.company_id and id=k.outsourcing_id and status<>'cancelled';return value;
 elsif k.kind<>'field_service' then return k.actual;end if;
 if exists(select 1 from public.field_service_costs fc where fc.company_id=k.company_id and fc.service_id=k.service_id and (fc.run=k.service_run and (fc.outsourcing_id is null and fc.actual is null or fc.outsourcing_id is not null and not exists(select 1 from public.outsourcing_orders o where o.company_id=fc.company_id and o.id=fc.outsourcing_id and o.actual_cost is not null and o.status<>'cancelled')) or fc.run is null and (fc.outsourcing_id is not null or fc.actual is null or fc.actual<>0) and k.service_run<=coalesce((select last_existing_run from private.quality_legacy_field_costs where cost_id=fc.id and company_id=fc.company_id),2147483647))) then return null;end if;
 if not exists(select 1 from public.field_service_costs fc where fc.company_id=k.company_id and fc.service_id=k.service_id and fc.run=k.service_run) and not exists(select 1 from public.field_service_materials fm where fm.company_id=k.company_id and fm.service_id=k.service_id and fm.run=k.service_run and fm.consumed>0) then return null;end if;
 return coalesce((select sum(case when fc.outsourcing_id is null then fc.actual else o.actual_cost+o.freight end) from public.field_service_costs fc left join public.outsourcing_orders o on o.company_id=fc.company_id and o.id=fc.outsourcing_id where fc.company_id=k.company_id and fc.service_id=k.service_id and fc.run=k.service_run),0)+coalesce((select sum(fm.consumed*fm.unit_cost) from public.field_service_materials fm where fm.company_id=k.company_id and fm.service_id=k.service_id and fm.run=k.service_run),0);
end$$;
revoke all on function private.quality_cost_actual(public.quality_costs) from public,anon,authenticated;
create function private.quality_cost_summary(p_nc uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n public.quality_nonconformities%rowtype;x public.quality_costs%rowtype;v numeric;planned numeric:=0;actual numeric:=0;unknown boolean:=false;has_cost boolean:=false;has_actual boolean:=false;begin
 select * into n from public.quality_nonconformities where id=p_nc;
 if n.id is null then raise exception 'Qualidade: NC indisponível.' using errcode='P0002';end if;
 select coalesce(sum(quantity*unit_cost),0),count(*)>0 into actual,has_cost from public.quality_materials where nc_id=n.id and reversed_at is null;
 planned:=actual;has_actual:=has_cost;
 for x in select * from public.quality_costs where nc_id=n.id loop
  has_cost:=true;planned:=planned+x.planned;
  v:=private.quality_cost_actual(x);
  if v is null then unknown:=true;else actual:=actual+v;has_actual:=true;end if;
 end loop;
 return jsonb_build_object('planned',round(planned,2),'actual',case when has_actual then round(actual,2) end,'partial',unknown,'recorded',has_cost,'required',n.cost_applicable);
end$$;
revoke all on function private.quality_cost_summary(uuid) from public,anon,authenticated;

create function private.quality_ot_context_allowed(c text,order_ref text,item_ref text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.quality_actions a join public.quality_nonconformities n on n.id=a.nc_id and n.company_id=a.company_id
 where n.company_id=c and n.order_id=order_ref and n.order_item_id=item_ref and n.status not in('closed','cancelled') and a.execution_mode='outsourced' and a.state in('planned','running')
 and (exists(select 1 from private.quality_queue_context ctx where ctx.backend=pg_backend_pid() and ctx.transaction=txid_current() and ctx.action_id=a.id) or a.outsourcing_id is not null)
 and exists(select 1 from public.orders where company_id=c and id=order_ref and status<>'cancelado'))
$$;
revoke all on function private.quality_ot_context_allowed(text,text,text) from public,anon,authenticated;
-- The canonical function may be owned by a different trusted migration role.
-- Grant only that existing owner; never expose this context helper to clients.
do $$declare canonical_owner name;begin
 select pg_get_userbyid(proowner) into strict canonical_owner from pg_proc where oid='public.composite_command(uuid,text,jsonb)'::regprocedure;
 execute format('grant execute on function private.quality_ot_context_allowed(text,text,text) to %I',canonical_owner);
end$$;

-- Preserve the canonical OT engine, adding only a scoped Quality admission rule.
do $$declare definition text;needle text:='if o.status not in (''producao'',''impressao'',''acabamento'') then raise exception ''Pedido não está em produção.'' using errcode=''22023'';end if;';replacement text;begin
 definition:=pg_get_functiondef('public.composite_command(uuid,text,jsonb)'::regprocedure);
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Qualidade: Guard canônico de OT divergente; revisar antes de aplicar.';end if;
 replacement:='if o.status not in (''producao'',''impressao'',''acabamento'') and not private.quality_ot_context_allowed(c,o.id,i.id) then raise exception ''Pedido não está em produção.'' using errcode=''22023'';end if;';
 execute replace(definition,needle,replacement);
end$$;

create function private.quality_queue_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare ctx uuid;begin
 begin perform 1 from public.orders where company_id=new.company_id and id=new.order_id for update nowait;
 exception when lock_not_available then raise exception 'Qualidade: Pedido em alteração. Atualize antes de continuar.' using errcode='40001';end;
 if tg_op='UPDATE' and (new.execution_number is distinct from old.execution_number or new.quality_action_id is distinct from old.quality_action_id or new.quality_action_id is not null and new.quantity is distinct from old.quantity) or tg_op='INSERT' and (new.execution_number<>1 or new.quality_action_id is not null) then
  select action_id into ctx from private.quality_queue_context where backend=pg_backend_pid() and transaction=txid_current();
  if ctx is null or not exists(select 1 from public.quality_actions a join public.quality_nonconformities n on n.company_id=a.company_id and n.id=a.nc_id where a.id=ctx and a.company_id=new.company_id and n.order_id=new.order_id and n.order_item_id=new.order_item_id) then raise exception 'Qualidade: Execução de retrabalho exige comando explícito autorizado.' using errcode='42501';end if;
 end if;
 if new.status in('concluido','expedicao','entregue','finalizado') and (tg_op='INSERT' or new.status is distinct from old.status) then
  if exists(select 1 from public.quality_nonconformities n where n.company_id=new.company_id and n.order_id=new.order_id and (n.order_item_id is null or n.order_item_id=new.order_item_id) and (n.production_id is null or n.production_id=new.id) and n.status not in('closed','cancelled') and (n.severity='critical' or n.block_completion)) then raise exception 'Qualidade: NC crítica/bloqueante pendente. Finalize o trabalho físico na fase Produção, registre reinspeção e encerre a NC antes de concluir esta etapa.' using errcode='22023';end if;
  if new.quality_action_id is not null and exists(select 1 from public.quality_actions where id=new.quality_action_id and state in('planned','running')) then raise exception 'Qualidade: Registre o resultado da execução corretiva antes de concluir a fila.' using errcode='22023';end if;
 end if;return new;
end$$;
revoke all on function private.quality_queue_guard() from public,anon,authenticated;
create trigger aa_quality_queue_guard before insert or update on public.production_queue for each row execute function private.quality_queue_guard();
create function private.quality_queue_history() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.quality_action_id is not null and new.status='concluido' and old.status is distinct from new.status then
 insert into public.production_executions(company_id,production_id,execution_number,quality_action_id,snapshot,actor) values(new.company_id,new.id,new.execution_number,new.quality_action_id,to_jsonb(new),auth.uid()) on conflict(production_id,execution_number) do nothing;
 end if;return new;
end$$;
revoke all on function private.quality_queue_history() from public,anon,authenticated;
create trigger quality_execution_history after update of status on public.production_queue for each row execute function private.quality_queue_history();
create function private.quality_ot_scope() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.quality_actions%rowtype;n public.quality_nonconformities%rowtype;begin
 if tg_op='INSERT' then select v.* into a from public.quality_actions v join private.quality_queue_context ctx on ctx.action_id=v.id where ctx.backend=pg_backend_pid() and ctx.transaction=txid_current();
 else select * into a from public.quality_actions where company_id=new.company_id and outsourcing_id=old.id;end if;
 if a.id is not null then
  select * into n from public.quality_nonconformities where id=a.nc_id and company_id=a.company_id;
  if n.order_id is distinct from new.order_id or n.order_item_id is distinct from new.order_item_id or a.supplier_id is distinct from new.supplier_id or a.quantity is distinct from new.quantity then raise exception 'Qualidade: OT de retrabalho preserva origem, quantidade e fornecedor da ação.' using errcode='22023';end if;
  new.scope_key:='quality:'||a.id;new.technical_snapshot:=new.technical_snapshot||jsonb_build_object('quality_nc_id',n.id,'quality_number',n.number,'quality_action_id',a.id);
 end if;return new;
end$$;
revoke all on function private.quality_ot_scope() from public,anon,authenticated;
create trigger quality_ot_scope before insert or update on public.outsourcing_orders for each row execute function private.quality_ot_scope();

create function private.quality_validate_assignees(c text,profile_ref text,supplier_ref text,team_list jsonb,required boolean default false) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if jsonb_typeof(team_list) is distinct from 'array' or jsonb_array_length(team_list)>20 or
  profile_ref is not null and not private.quality_actor_valid(c,profile_ref) or
  supplier_ref is not null and not exists(select 1 from public.suppliers where company_id=c and id=supplier_ref and active) or
  exists(select 1 from jsonb_array_elements_text(team_list) v where not private.quality_actor_valid(c,v)) then raise exception 'Qualidade: Responsável, fornecedor e equipe devem ser ativos da empresa.' using errcode='22023';end if;
 if required and profile_ref is null and supplier_ref is null and jsonb_array_length(team_list)=0 then raise exception 'Qualidade: Defina a responsabilidade operacional antes de encerrar.' using errcode='22023';end if;
end$$;
revoke all on function private.quality_validate_assignees(text,text,text,jsonb,boolean) from public,anon,authenticated;

create function private.quality_return_resolved(c text,service_ref uuid,run_ref integer) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.field_service_completions where company_id=c and service_id=service_ref and run=run_ref)
 or exists(select 1 from public.field_services where company_id=c and id=service_ref and run=run_ref and status='cancelled')
 or exists(select 1 from public.audit_logs where company_id=c and entity_id=service_ref::text and action='field_service.cancelled' and metadata->>'run'=run_ref::text)
$$;
revoke all on function private.quality_return_resolved(text,uuid,integer) from public,anon,authenticated;

create function public.quality_command(p_operation_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c text:=private.current_company_id();n public.quality_nonconformities%rowtype;a public.quality_actions%rowtype;memo private.quality_commands%rowtype;
 actor_row public.profiles%rowtype;o public.orders%rowtype;q public.production_queue%rowtype;i public.order_items%rowtype;
 ot public.outsourcing_orders%rowtype;fs public.field_services%rowtype;material public.quality_materials%rowtype;product public.products%rowtype;
 cost public.quality_costs%rowtype;financial public.financial_transactions%rowtype;evidence public.quality_evidence%rowtype;
 origin jsonb;result jsonb:='{}';v jsonb;summary jsonb;team_list jsonb;qty numeric;seq bigint;reason text:=btrim(coalesce(p_payload->>'reason',''));profile_ref text;supplier_ref text;source_item text;required_inspection boolean;kind text;mode text;action_no integer;effective numeric;cost_revision text;begin
 select * into actor_row from public.profiles where company_id=c and auth_user_id=auth.uid() and active order by id limit 1;
 if actor_row.id is null or p_operation_id is null or p_action is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>180000 or p_payload?'company_id' then raise exception 'Sem permissão para comando ou empresa.' using errcode='42501';end if;
 if p_action='create' then
  if not private.quality_authorized(p_action,n) then raise exception 'Sem permissão para abrir NC.' using errcode='42501';end if;
  source_item:=nullif(p_payload->>'source_item_id','');
  origin:=private.quality_origin(c,p_payload->>'source_type',p_payload->>'source_id',source_item);
  if origin->>'order_id' is not null then perform 1 from public.orders where company_id=c and id=origin->>'order_id' for update;
  elsif origin->>'purchase_id' is not null then perform 1 from public.purchase_orders where company_id=c and id=(origin->>'purchase_id')::uuid for update;end if;
  origin:=private.quality_origin(c,p_payload->>'source_type',p_payload->>'source_id',source_item);
 else
  select * into n from public.quality_nonconformities where company_id=c and id=(p_payload->>'id')::uuid;
  if n.id is null then raise exception 'Qualidade: NC indisponível para sua empresa.' using errcode='P0002';end if;
  if n.order_id is not null then select * into o from public.orders where company_id=c and id=n.order_id for update;
  elsif n.purchase_id is not null then perform 1 from public.purchase_orders where company_id=c and id=n.purchase_id for update;end if;
  select * into n from public.quality_nonconformities where company_id=c and id=n.id for update;
  if not private.quality_authorized(p_action,n) then raise exception 'Sem permissão atual para esta ação de Qualidade.' using errcode='42501';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('quality-command:'||c||p_operation_id,0));
 select * into memo from private.quality_commands where company_id=c and operation_id=p_operation_id;
 if found then
  if memo.actor<>auth.uid() then raise exception 'Sem permissão para repetir comando de outro usuário.' using errcode='42501';end if;
  if memo.action<>p_action or memo.payload<>p_payload then raise exception 'Qualidade: Chave reutilizada com conteúdo diferente.' using errcode='22023';end if;
  return memo.result;
 end if;
 perform private.saas_assert_write(c,null);
 if p_action<>'create' then
  if n.updated_at is distinct from (p_payload->>'updated_at')::timestamptz then raise exception 'Qualidade: NC mudou. Atualize antes de continuar.' using errcode='40001';end if;
  if n.status in('closed','cancelled') and p_action not in('reopen','cost_cancel','material_reverse','file_remove') then raise exception 'Qualidade: NC encerrada preserva o histórico. Reabra com autorização.' using errcode='22023';end if;
  if n.action_id is not null then select * into a from public.quality_actions where company_id=c and nc_id=n.id and id=n.action_id for update;end if;
 end if;

 if p_action='create' then
  if p_payload->>'source_updated_at' is null or p_payload->>'source_updated_at' is distinct from origin->>'version' then raise exception 'Qualidade: Origem mudou. Confira seu contexto antes de abrir a NC.' using errcode='40001';end if;
  qty:=coalesce((p_payload->>'affected_quantity')::numeric,(origin->>'quantity')::numeric);
  if qty is null or qty<=0 or qty>1000000 or qty<>round(qty,6) or qty>(origin->>'quantity')::numeric then raise exception 'Qualidade: Quantidade afetada inválida; escolha o item e respeite a quantidade da origem.' using errcode='22023';end if;
  profile_ref:=nullif(p_payload->>'assigned_profile_id','');supplier_ref:=nullif(p_payload->>'responsible_supplier_id','');team_list:=coalesce(p_payload->'team','[]');
  perform private.quality_validate_assignees(c,profile_ref,supplier_ref,team_list);
  insert into private.quality_counters values(c,1) on conflict(company_id) do update set number=private.quality_counters.number+1 returning number into seq;
  insert into public.quality_nonconformities(company_id,number,source_type,source_id,order_id,order_item_id,product_id,production_id,supplier_id,purchase_id,purchase_item_id,receipt_id,outsourcing_id,service_id,category,severity,problem_origin,description,assigned_profile_id,responsible_supplier_id,team,source_snapshot,affected_quantity,block_completion,cost_applicable,deadline_impact_days,created_by)
  values(c,seq,p_payload->>'source_type',p_payload->>'source_id',origin->>'order_id',origin->>'order_item_id',origin->>'product_id',origin->>'production_id',origin->>'supplier_id',(origin->>'purchase_id')::uuid,(origin->>'purchase_item_id')::uuid,(origin->>'receipt_id')::uuid,(origin->>'outsourcing_id')::uuid,(origin->>'service_id')::uuid,p_payload->>'category',p_payload->>'severity',coalesce(p_payload->>'problem_origin','undefined'),btrim(p_payload->>'description'),profile_ref,supplier_ref,team_list,origin->'snapshot',qty,coalesce((p_payload->>'block_completion')::boolean,false),coalesce((p_payload->>'cost_applicable')::boolean,false),coalesce((p_payload->>'deadline_impact_days')::integer,0),auth.uid()) returning * into n;
  insert into private.quality_cost_salts(nc_id) values(n.id);
  perform private.quality_audit(n,'nc_created',jsonb_build_object('source_type',n.source_type,'source_id',n.source_id,'severity',n.severity),p_operation_id);
 elsif p_action='update' then
  profile_ref:=nullif(p_payload->>'assigned_profile_id','');supplier_ref:=nullif(p_payload->>'responsible_supplier_id','');team_list:=coalesce(p_payload->'team','[]');
  perform private.quality_validate_assignees(c,profile_ref,supplier_ref,team_list);
  if n.status in('rework','reinspection') and (p_payload->>'severity' is distinct from n.severity or coalesce((p_payload->>'block_completion')::boolean,false) is distinct from n.block_completion) then raise exception 'Qualidade: Preserve severidade/bloqueio durante execução ou reinspeção.' using errcode='22023';end if;
  update public.quality_nonconformities set description=btrim(p_payload->>'description'),category=p_payload->>'category',severity=p_payload->>'severity',problem_origin=coalesce(p_payload->>'problem_origin','undefined'),assigned_profile_id=profile_ref,responsible_supplier_id=supplier_ref,team=team_list,block_completion=coalesce((p_payload->>'block_completion')::boolean,false),cost_applicable=coalesce((p_payload->>'cost_applicable')::boolean,false),deadline_impact_days=coalesce((p_payload->>'deadline_impact_days')::integer,0) where id=n.id returning * into n;
  perform private.quality_audit(n,'nc_updated','{}',p_operation_id);
 elsif p_action='analyze' then
  if n.status not in('open','analysis','action_defined') or a.state='running' then raise exception 'Qualidade: Análise não pode sobrescrever uma execução em andamento.' using errcode='22023';end if;
  update public.quality_nonconformities set analysis=btrim(coalesce(p_payload->>'analysis','')),root_cause=btrim(coalesce(p_payload->>'root_cause','')),problem_origin=coalesce(p_payload->>'problem_origin',problem_origin),status=case when status='open' then 'analysis' else status end where id=n.id returning * into n;
  perform private.quality_audit(n,'analysis_recorded','{}',p_operation_id);
 elsif p_action='action_define' then
  if n.status not in('analysis','action_defined') or a.state in('running','done') then raise exception 'Qualidade: Analise a NC e preserve ações em execução/concluídas. Reprovação exige uma nova versão.' using errcode='22023';end if;
  kind:=p_payload->>'kind';mode:=p_payload->>'execution_mode';qty:=coalesce((p_payload->>'quantity')::numeric,n.affected_quantity);
  if qty is null or qty<=0 or qty<>n.affected_quantity or qty<>round(qty,6) then raise exception 'Qualidade: A ação deve cobrir toda a quantidade afetada da NC. Reprodução parcial usa a quantidade afetada do item, sem reproduzir o Pedido inteiro.' using errcode='22023';end if;
  if (kind in('rework','reproduction') and mode not in('internal','outsourced','field')) or (mode in('internal','outsourced') and n.order_item_id is null) or (mode='field' and n.service_id is null) or (kind in('supplier_return','restricted_acceptance','no_action') and mode<>'none') then raise exception 'Qualidade: Defina execução compatível com a ação e sua origem.' using errcode='22023';end if;
  if kind='supplier_return' and n.receipt_id is null then raise exception 'Qualidade: Devolução exige um recebimento canônico de Compra. A reversão existente é integral e explícita.' using errcode='22023';end if;
  profile_ref:=nullif(p_payload->>'assigned_profile_id','');supplier_ref:=nullif(p_payload->>'supplier_id','');
  perform private.quality_validate_assignees(c,profile_ref,supplier_ref,'[]',true);
  if mode in('internal','field') and profile_ref is null then raise exception 'Qualidade: Execução interna/externa exige responsável interno ativo.' using errcode='22023';end if;
  if mode in('internal','outsourced') and qty<>round(qty,2) then raise exception 'Qualidade: A quantidade da execução deve respeitar as duas casas da fila canônica.' using errcode='22023';end if;
  if mode='outsourced' and supplier_ref is null then raise exception 'Qualidade: Terceirização exige fornecedor ativo.' using errcode='22023';end if;
  if mode='outsourced' and nullif(p_payload->>'due_date','') is null then raise exception 'Qualidade: Terceirização exige prazo definido para a OT canônica.' using errcode='22023';end if;
  required_inspection:=kind in('rework','reproduction','substitution','supplier_return','adjustment') or coalesce((p_payload->>'requires_reinspection')::boolean,false);
  if a.id is not null and a.state='planned' then update public.quality_actions set state='superseded',updated_at=clock_timestamp() where id=a.id;end if;
  select coalesce(max(version),0)+1 into action_no from public.quality_actions where nc_id=n.id;
  insert into public.quality_actions(company_id,nc_id,cycle,version,kind,execution_mode,quantity,assigned_profile_id,supplier_id,due_date,notes,requires_reinspection,actor)
  values(c,n.id,n.cycle,action_no,kind,mode,qty,profile_ref,supplier_ref,(p_payload->>'due_date')::date,btrim(p_payload->>'notes'),required_inspection,auth.uid()) returning * into a;
  update public.quality_nonconformities set action_id=a.id,status='action_defined' where id=n.id returning * into n;
  perform private.quality_audit(n,'action_defined',jsonb_build_object('action_id',a.id,'version',a.version,'kind',a.kind,'quantity',a.quantity,'mode',a.execution_mode,'due_date',a.due_date),p_operation_id);
 elsif p_action='action_start' then
  if a.id is null or n.status<>'action_defined' or a.state<>'planned' then raise exception 'Qualidade: Defina uma ação ainda não iniciada.' using errcode='22023';end if;
  if a.execution_mode='field' and o.status='cancelado' then raise exception 'Qualidade: Pedido cancelado não recebe nova execução de retorno.' using errcode='22023';end if;
  perform private.quality_validate_assignees(c,a.assigned_profile_id,a.supplier_id,'[]',true);
  if a.execution_mode in('internal','outsourced') then
   if not private.quality_allowed('/production') then raise exception 'Sem permissão para iniciar retrabalho na Produção.' using errcode='42501';end if;
   if o.id is null or o.status='cancelado' then raise exception 'Qualidade: Pedido cancelado não recebe nova execução operacional.' using errcode='22023';end if;
   select * into q from public.production_queue where company_id=c and order_id=n.order_id and order_item_id=n.order_item_id for update;
   if q.id is null then raise exception 'Qualidade: Use a fila canônica do item. Não é criada Produção paralela.' using errcode='22023';end if;
   if q.updated_at is distinct from (p_payload->>'production_updated_at')::timestamptz then raise exception 'Qualidade: A fila mudou. Atualize antes de iniciar a execução.' using errcode='40001';end if;
   if q.quality_action_id is not null and exists(select 1 from public.quality_actions where id=q.quality_action_id and state in('planned','running')) then raise exception 'Qualidade: Este item já possui retrabalho em execução.' using errcode='22023';end if;
   insert into public.production_executions(company_id,production_id,execution_number,quality_action_id,snapshot,actor) values(c,q.id,q.execution_number,q.quality_action_id,to_jsonb(q),auth.uid()) on conflict(production_id,execution_number) do nothing;
   update public.quality_actions set production_before=to_jsonb(q),production_id=q.id,production_run=q.execution_number+1 where id=a.id;
   insert into private.quality_queue_context values(pg_backend_pid(),txid_current(),a.id);
   update public.production_queue set execution_number=execution_number+1,quality_action_id=a.id,quantity=a.quantity,status='fila',started_at=null,finished_at=null where id=q.id returning * into q;
   if a.execution_mode='outsourced' then
    if not private.quality_finance() and (coalesce((p_payload->>'unit_cost')::numeric,0)<>0 or coalesce((p_payload->>'freight')::numeric,0)<>0) then raise exception 'Sem permissão para informar valores financeiros.' using errcode='42501';end if;
    v:=public.composite_command(gen_random_uuid(),'ot_save',jsonb_build_object('order_item_id',n.order_item_id,'supplier_id',a.supplier_id,'title','RETRABALHO NC-'||lpad(n.number::text,4,'0'),'specification',a.notes,'quantity',a.quantity,'unit',coalesce(p_payload->>'unit','unidade'),'due_date',a.due_date,'unit_cost',coalesce((p_payload->>'unit_cost')::numeric,0),'freight',coalesce((p_payload->>'freight')::numeric,0),'dependent',true));
    update public.quality_actions set outsourcing_id=(v->>'id')::uuid where id=a.id;
   end if;
   delete from private.quality_queue_context where backend=pg_backend_pid() and transaction=txid_current();
  end if;
  update public.quality_actions set state='running',started_at=clock_timestamp(),updated_at=clock_timestamp() where id=a.id returning * into a;
  update public.quality_nonconformities set status='rework' where id=n.id returning * into n;
  perform private.quality_audit(n,'rework_started',jsonb_build_object('action_id',a.id,'mode',a.execution_mode,'quantity',a.quantity,'production_id',a.production_id,'execution_number',a.production_run,'outsourcing_id',a.outsourcing_id),p_operation_id);
 elsif p_action='action_finish' then
  if a.id is null or n.status<>'rework' or a.state<>'running' or length(btrim(coalesce(p_payload->>'result','')))<5 then raise exception 'Qualidade: Informe o resultado da ação em execução.' using errcode='22023';end if;
  if a.execution_mode='internal' then
   select * into q from public.production_queue where company_id=c and id=a.production_id for update;
   if q.quality_action_id is distinct from a.id or q.execution_number<>a.production_run or q.status not in('producao','impressao','acabamento','concluido') or q.started_at is null then raise exception 'Qualidade: Execute o retrabalho na fila canônica antes de registrar seu resultado.' using errcode='22023';end if;
  elsif a.execution_mode='outsourced' then
   select * into ot from public.outsourcing_orders where company_id=c and id=a.outsourcing_id;
   if ot.id is null or ot.status<>'received' then raise exception 'Qualidade: Conclua o recebimento canônico da OT antes da reinspeção.' using errcode='22023';end if;
  elsif a.execution_mode='field' then
   select * into fs from public.field_services where company_id=c and id=a.return_service_id;
   if fs.id is null or not exists(select 1 from public.field_service_completions where company_id=c and service_id=fs.id and run=a.return_run and coalesce((snapshot#>>'{service,completed_at}')::timestamptz,completed_at)>=n.opened_at) then raise exception 'Qualidade: Conclua a execução canônica do retorno técnico vinculado.' using errcode='22023';end if;
  end if;
  if a.kind='supplier_return' and not exists(select 1 from public.purchase_receipts where company_id=c and id=n.receipt_id and reversed_at is not null) then raise exception 'Qualidade: Registre a devolução pela reversão canônica do recebimento em Compras.' using errcode='22023';end if;
  if a.kind='restricted_acceptance' and length(btrim(coalesce(p_payload->>'acceptance','')))<5 then raise exception 'Qualidade: Aceite com restrição exige observação/aceite explícito. O defeito permanece registrado.' using errcode='22023';end if;
  v:=case when q.id is not null then to_jsonb(q)
   when ot.id is not null then jsonb_build_object('type','outsourcing','id',ot.id,'number',ot.number,'quantity',ot.quantity,'status',ot.status,'receipts',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'quantity',quantity,'received_date',received_date)),'[]') from public.outsourcing_receipts where company_id=c and outsourcing_id=ot.id and reversed_at is null))
   when fs.id is not null then jsonb_build_object('type','field_service','id',fs.id,'number',fs.number,'run',a.return_run,'completion_id',(select id from public.field_service_completions where company_id=c and service_id=fs.id and run=a.return_run))
   when a.kind='supplier_return' then jsonb_build_object('type','receipt_reversal','id',n.receipt_id,'scope','entire_receipt','reversed_at',(select reversed_at from public.purchase_receipts where company_id=c and id=n.receipt_id)) end;
  update public.quality_actions set result=btrim(p_payload->>'result'),acceptance=left(btrim(coalesce(p_payload->>'acceptance','')),2000),state='done',execution_snapshot=v,finished_at=clock_timestamp(),updated_at=clock_timestamp() where id=a.id returning * into a;
  update public.quality_nonconformities set status=case when a.requires_reinspection then 'reinspection' else 'action_defined' end where id=n.id returning * into n;
  perform private.quality_audit(n,'action_completed',jsonb_build_object('action_id',a.id,'requires_reinspection',a.requires_reinspection),p_operation_id);
 elsif p_action='field_return' then
  if a.id is null or n.status<>'rework' or a.state<>'running' or a.execution_mode<>'field' or n.service_id is null then raise exception 'Qualidade: Inicie uma ação de retorno técnico vinculada ao serviço original.' using errcode='22023';end if;
  if a.return_service_id is not null then raise exception 'Qualidade: Esta ação já possui retorno vinculado.' using errcode='22023';end if;
  select * into fs from public.field_services where company_id=c and id=n.service_id;
  if nullif(p_payload->>'service_id','') is not null then
   select * into fs from public.field_services where company_id=c and id=(p_payload->>'service_id')::uuid and service_type='return' and order_id=n.order_id and order_item_id is not distinct from n.order_item_id;
   if fs.id is null or not private.fs_can_read(fs.id) or fs.status='cancelled' or fs.completed_at<n.opened_at or fs.id=n.service_id and fs.run<=(n.source_snapshot#>>'{service,run}')::integer or exists(select 1 from public.quality_actions where return_service_id=fs.id and return_run=fs.run) then raise exception 'Qualidade: Retorno incompatível, anterior à NC ou já utilizado nesta execução. Reabra o serviço canônico quando necessário.' using errcode='22023';end if;
  else
   if a.assigned_profile_id is null then raise exception 'Qualidade: Defina responsável interno para o retorno.' using errcode='22023';end if;
   v:=public.field_service_command(gen_random_uuid(),'save',jsonb_build_object('order_id',n.order_id,'order_item_id',n.order_item_id,'service_type','return','title','Retorno técnico · NC-'||lpad(n.number::text,4,'0'),'assigned_profile_id',a.assigned_profile_id,'team','[]'::jsonb,'address',n.source_snapshot#>'{service,address}','checklist','[{"id":"local","label":"Local e solicitação conferidos","required":false,"done":false},{"id":"retorno","label":"Correção do retorno conferida","required":true,"done":false}]'::jsonb,'notes',left('NC-'||lpad(n.number::text,4,'0')||' · Serviço original SE-'||lpad(fs.number::text,4,'0')||' · '||a.notes,5000),'photo_required',fs.photo_required,'acceptance_required',fs.acceptance_required));
   if coalesce((v->>'reused')::boolean,false) then raise exception 'Qualidade: Já existe retorno deste item. Abra/reabra o serviço existente e use Vincular retorno, sem duplicá-lo.' using errcode='22023';end if;
   select * into fs from public.field_services where company_id=c and id=(v->>'id')::uuid;
  end if;
  update public.quality_actions set return_service_id=fs.id,return_run=fs.run,updated_at=clock_timestamp() where id=a.id returning * into a;
  result:=jsonb_build_object('service_id',fs.id);perform private.quality_audit(n,'field_return_linked',jsonb_build_object('action_id',a.id,'original_service_id',n.service_id,'return_service_id',fs.id,'run',fs.run),p_operation_id);
 elsif p_action='action_cancel' then
  if a.id is null or a.state not in('planned','running') or length(reason)<5 then raise exception 'Qualidade: Cancelamento de ação exige estado válido e motivo.' using errcode='22023';end if;
  if a.outsourcing_id is not null and exists(select 1 from public.outsourcing_orders where company_id=c and id=a.outsourcing_id and status<>'cancelled') or a.return_service_id is not null and not private.quality_return_resolved(c,a.return_service_id,a.return_run) or exists(select 1 from public.quality_materials where action_id=a.id and reversed_at is null) then raise exception 'Qualidade: Cancele a OT/retorno e reverta consumos canônicos antes de cancelar a ação.' using errcode='22023';end if;
  update public.quality_actions set state='cancelled',result=reason,finished_at=clock_timestamp(),updated_at=clock_timestamp() where id=a.id;
  update public.quality_nonconformities set status='analysis',action_id=null where id=n.id returning * into n;
  perform private.quality_audit(n,'action_cancelled',jsonb_build_object('action_id',a.id,'reason',reason,'production_id',a.production_id),p_operation_id);
 elsif p_action='action_invalidate' then
  if a.id is null or a.state<>'done' or length(reason) not between 5 and 1000 then raise exception 'Qualidade: Invalidação exige ação concluída e motivo. Resultados e reinspeções anteriores serão preservados.' using errcode='22023';end if;
  update public.quality_actions set state='failed',invalidation_reason=reason,updated_at=clock_timestamp() where id=a.id;
  update public.quality_nonconformities set status='analysis' where id=n.id returning * into n;
  perform private.quality_audit(n,'action_invalidated',jsonb_build_object('action_id',a.id,'reason',reason),p_operation_id);
 elsif p_action in('material_consume','material_reverse') then
  if not private.purchase_allowed('/stock') then raise exception 'Sem permissão para movimentar Estoque.' using errcode='42501';end if;
  if p_action='material_consume' then
   if a.id is null or a.state<>'running' or n.status<>'rework' then raise exception 'Qualidade: Consumo adicional exige ação em execução.' using errcode='22023';end if;
   if a.execution_mode='field' then raise exception 'Qualidade: Materiais do retorno são movimentados somente em Serviços Externos, sem duplicar consumo pela NC.' using errcode='22023';end if;
   if a.kind in('no_action','restricted_acceptance') or n.order_id is not null and o.status='cancelado' then raise exception 'Qualidade: Ação sem trabalho físico ou Pedido cancelado não recebe novo consumo.' using errcode='22023';end if;
   qty:=(p_payload->>'quantity')::numeric;
   if qty is null or qty<=0 or qty>1000000 or qty<>round(qty,6) then raise exception 'Qualidade: Informe quantidade física positiva, com até seis casas.' using errcode='22023';end if;
   select * into product from public.products where company_id=c and id=p_payload->>'product_id' and active and stock_controlled and structure_type='simple' for update;
   if product.id is null then raise exception 'Qualidade: Material físico ativo da empresa é obrigatório.' using errcode='22023';end if;
   if exists(select 1 from public.quality_materials where action_id=a.id and product_id=product.id and reversed_at is null) then raise exception 'Qualidade: Material já consumido nesta ação. Reverta com motivo antes de corrigir o total.' using errcode='22023';end if;
   effective:=private.product_reference_cost(product);
   v:=private.move_inventory(c,product.id,qty,'saida','Retrabalho NC-'||lpad(n.number::text,4,'0')||' · ação '||a.version,effective);
   if v->>'status'<>'UPDATED' then raise exception 'Qualidade: Estoque insuficiente ou material indisponível.' using errcode='22023';end if;
   insert into public.quality_materials(company_id,nc_id,action_id,product_id,description,unit,quantity,unit_cost,stock_movement_id,actor) values(c,n.id,a.id,product.id,product.name,private.product_inventory_unit(product),qty,effective,v#>>'{movement,id}',auth.uid()) returning * into material;
   perform private.quality_audit(n,'material_consumed',jsonb_build_object('material_id',material.id,'action_id',a.id,'quantity',qty,'unit',material.unit),p_operation_id);
  else
   if not private.quality_allowed('/quality/manage') or length(reason)<5 then raise exception 'Qualidade: Reversão exige gestor e motivo do retorno físico/correção.' using errcode='22023';end if;
   select * into material from public.quality_materials where company_id=c and nc_id=n.id and id=(p_payload->>'material_id')::uuid for update;
   if material.id is null then raise exception 'Qualidade: Material indisponível.' using errcode='P0002';end if;
   if material.reversed_at is null then
    v:=private.move_inventory(c,material.product_id,material.quantity,'entrada','Reversão retrabalho NC-'||lpad(n.number::text,4,'0')||' · '||reason,material.unit_cost);
    if v->>'status'<>'UPDATED' then raise exception 'Qualidade: Não foi possível confirmar a reversão física.' using errcode='22023';end if;
    update public.quality_materials set reversed_at=clock_timestamp(),reversal_reason=reason,reversal_movement_id=v#>>'{movement,id}' where id=material.id;
    perform private.quality_audit(n,'material_reversed',jsonb_build_object('material_id',material.id,'reason',reason),p_operation_id);
   end if;
  end if;
 elsif p_action in('cost_save','cost_export','cost_cancel') then
  if p_payload->>'cost_id' is not null then select * into cost from public.quality_costs where company_id=c and nc_id=n.id and id=(p_payload->>'cost_id')::uuid for update;if cost.id is null then raise exception 'Qualidade: Custo indisponível.' using errcode='P0002';end if;end if;
  if p_action='cost_save' then
   if cost.id is null and nullif(p_payload->>'action_id','') is not null then select * into a from public.quality_actions where company_id=c and nc_id=n.id and id=(p_payload->>'action_id')::uuid;if a.id is null then raise exception 'Qualidade: Ação do custo indisponível.' using errcode='P0002';end if;end if;
   if a.id is null and cost.id is null then raise exception 'Qualidade: Defina a ação corretiva antes de registrar custos.' using errcode='22023';end if;
   if length(btrim(coalesce(p_payload->>'description',''))) not between 2 and 300 then raise exception 'Qualidade: Informe a descrição do custo.' using errcode='22023';end if;
   kind:=p_payload->>'kind';effective:=(p_payload->>'actual')::numeric;
   if cost.id is not null and (cost.kind is distinct from kind or length(reason)<5) then raise exception 'Qualidade: Correção de custo preserva tipo e exige motivo.' using errcode='22023';end if;
   if cost.financial_id is not null and (length(reason)<5 or not exists(select 1 from public.financial_transactions where company_id=c and id=cost.financial_id and cancelled_at is not null)) then raise exception 'Qualidade: Cancele a obrigação canônica e informe motivo antes de corrigir o custo.' using errcode='22023';end if;
   if kind='outsourcing' then
    select * into ot from public.outsourcing_orders where company_id=c and id=(p_payload->>'outsourcing_id')::uuid and order_id=n.order_id and order_item_id=n.order_item_id;
    if ot.id is null or not exists(select 1 from public.quality_actions where company_id=c and nc_id=n.id and outsourcing_id=ot.id) then raise exception 'Qualidade: Use a OT canônica desta ação de retrabalho.' using errcode='22023';end if;effective:=null;
   elsif kind='field_service' then
    select * into fs from public.field_services where company_id=c and id=(p_payload->>'service_id')::uuid;
    if fs.id is null or not exists(select 1 from public.quality_actions where company_id=c and nc_id=n.id and return_service_id=fs.id and return_run=coalesce(cost.service_run,a.return_run)) then raise exception 'Qualidade: Use a execução de retorno técnico canônico desta NC.' using errcode='22023';end if;effective:=null;
   elsif p_payload->>'outsourcing_id' is not null or p_payload->>'service_id' is not null then raise exception 'Qualidade: Referência externa incompatível com o tipo de custo.' using errcode='22023';end if;
   if cost.id is not null and (cost.outsourcing_id is distinct from ot.id or cost.service_id is distinct from fs.id) then raise exception 'Qualidade: Preserve a referência canônica do custo.' using errcode='22023';end if;
   insert into public.quality_costs(id,company_id,nc_id,action_id,kind,description,planned,actual,outsourcing_id,service_id,service_run,financial_history,actor)
   values(coalesce(cost.id,gen_random_uuid()),c,n.id,coalesce(cost.action_id,a.id),kind,btrim(p_payload->>'description'),coalesce((p_payload->>'planned')::numeric,0),effective,ot.id,fs.id,case when fs.id is not null then coalesce(cost.service_run,a.return_run) end,coalesce(cost.financial_history,'[]')||case when cost.financial_id is null then '[]'::jsonb else jsonb_build_array(cost.financial_id) end,auth.uid())
   on conflict(id) do update set description=excluded.description,planned=excluded.planned,actual=excluded.actual,financial_id=null,financial_history=excluded.financial_history,updated_at=clock_timestamp() returning * into cost;
   perform private.quality_audit(n,'cost_recorded',jsonb_build_object('cost_id',cost.id,'reason',reason),p_operation_id);
  elsif p_action='cost_export' then
   if cost.id is null or cost.kind in('outsourcing','field_service') or cost.actual is null or cost.actual<=0 then raise exception 'Qualidade: Informe despesa efetiva positiva. OT e retorno usam o Financeiro canônico da origem, sem duplicação.' using errcode='22023';end if;
   if cost.financial_id is not null and exists(select 1 from public.financial_transactions where company_id=c and id=cost.financial_id and cancelled_at is not null) then raise exception 'Qualidade: Corrija o custo após o cancelamento antes de gerar nova obrigação.' using errcode='22023';end if;
   if cost.financial_id is null then
    v:=public.finance_command(gen_random_uuid(),'payable_create',jsonb_build_object('account_id',p_payload->>'account_id','category_id',p_payload->>'category_id','amount',cost.actual,'date',p_payload->>'date','description','NC-'||lpad(n.number::text,4,'0')||' · '||cost.description,'method','pix','pay_now',false));
    update public.quality_costs set financial_id=v#>>'{transaction,id}',updated_at=clock_timestamp() where id=cost.id returning * into cost;
    perform private.quality_audit(n,'payable_created',jsonb_build_object('cost_id',cost.id,'financial_id',cost.financial_id),p_operation_id);
   end if;
  else
   if cost.id is null or length(reason)<5 then raise exception 'Qualidade: Cancelamento da obrigação exige custo e motivo.' using errcode='22023';end if;
   select * into financial from public.financial_transactions where company_id=c and id=cost.financial_id for update;
   if financial.id is not null and financial.cancelled_at is null then perform public.finance_command(gen_random_uuid(),'payable_cancel',jsonb_build_object('id',financial.id,'updated_at',financial.updated_at));perform private.quality_audit(n,'payable_cancelled',jsonb_build_object('cost_id',cost.id,'reason',reason),p_operation_id);end if;
  end if;
  insert into public.quality_cost_history(company_id,nc_id,cost_id,snapshot,actor) values(c,n.id,cost.id,jsonb_build_object('action',p_action,'cost',to_jsonb(cost)||jsonb_build_object('effective_actual',private.quality_cost_actual(cost)),'reason',reason,'summary',private.quality_cost_summary(n.id)),auth.uid());
 elsif p_action='reinspect' then
  if n.status<>'reinspection' or a.id is null or a.state<>'done' or not a.requires_reinspection or p_payload->>'result' not in('approved','rejected') or length(btrim(coalesce(p_payload->>'notes','')))<5 then raise exception 'Qualidade: Reinspeção exige ação concluída e resultado fundamentado.' using errcode='22023';end if;
  insert into public.quality_reinspections(company_id,nc_id,action_id,cycle,result,notes,actor,actor_name) values(c,n.id,a.id,n.cycle,p_payload->>'result',btrim(p_payload->>'notes'),auth.uid(),actor_row.name);
  if p_payload->>'result'='rejected' then update public.quality_actions set state='failed',updated_at=clock_timestamp() where id=a.id;update public.quality_nonconformities set status='analysis' where id=n.id returning * into n;end if;
  perform private.quality_audit(n,'reinspection_completed',jsonb_build_object('action_id',a.id,'result',p_payload->>'result'),p_operation_id);
 elsif p_action='close' then
  if n.status in('closed','cancelled') or a.id is null or a.cycle<>n.cycle or a.state<>'done' or length(btrim(n.root_cause))<5 or length(btrim(a.result))<5 then raise exception 'Qualidade: Encerramento exige causa, ação e resultado concluído neste ciclo.' using errcode='22023';end if;
  cost_revision:=private.quality_cost_version(n.id);
  if cost_revision is null or p_payload->>'cost_version' is distinct from cost_revision then raise exception 'Qualidade: Execuções ou apuração mudaram. Atualize e confira os dados antes de encerrar.' using errcode='40001';end if;
  if a.execution_mode='outsourced' and (not exists(select 1 from public.outsourcing_orders where company_id=c and id=a.outsourcing_id and status='received') or exists(select 1 from public.outsourcing_receipts r where r.company_id=c and r.outsourcing_id=a.outsourcing_id and r.reversed_at is not null and exists(select 1 from jsonb_array_elements(coalesce(a.execution_snapshot->'receipts','[]')) x where x->>'id'=r.id::text))) then raise exception 'Qualidade: A comprovação da OT foi revertida. Invalide a ação e registre nova conferência, preservando as inspeções anteriores.' using errcode='22023';end if;
  perform private.quality_validate_assignees(c,n.assigned_profile_id,n.responsible_supplier_id,n.team,true);
  if a.requires_reinspection and not exists(select 1 from public.quality_reinspections r where r.action_id=a.id and r.result='approved') then raise exception 'Qualidade: Reinspeção aprovada é obrigatória antes do encerramento.' using errcode='22023';end if;
  if exists(select 1 from public.quality_evidence where nc_id=n.id and state='pending') then raise exception 'Qualidade: Aguarde ou remova uploads pendentes antes de encerrar.' using errcode='22023';end if;
  summary:=private.quality_cost_summary(n.id);
  if (summary->>'partial')::boolean or n.cost_applicable and not(summary->>'recorded')::boolean then raise exception 'Qualidade: Informe os custos efetivos aplicáveis, inclusive os canônicos externos. Ausência de custo não equivale a zero.' using errcode='22023';end if;
  update public.quality_nonconformities set status='closed',closed_at=clock_timestamp() where id=n.id returning * into n;
  insert into public.quality_closures(company_id,nc_id,cycle,snapshot,cost_snapshot,actor)
  values(c,n.id,n.cycle,jsonb_build_object('nc',to_jsonb(n),'action',to_jsonb(a),'reinspection',(select to_jsonb(r) from public.quality_reinspections r where action_id=a.id),
   'team',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') from public.profiles where company_id=c and (id=n.assigned_profile_id or n.team?id)),
   'materials',(select coalesce(jsonb_agg(to_jsonb(m)-'unit_cost'),'[]') from public.quality_materials m where nc_id=n.id and reversed_at is null),
   'evidence',(select coalesce(jsonb_agg(to_jsonb(e) order by created_at),'[]') from public.quality_evidence e where nc_id=n.id and cycle=n.cycle and state='ready')),summary||jsonb_build_object('materials',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.quality_materials m where nc_id=n.id),'costs',(select coalesce(jsonb_agg(to_jsonb(k)||jsonb_build_object('effective_actual',private.quality_cost_actual(k))),'[]') from public.quality_costs k where nc_id=n.id)),auth.uid());
  perform private.quality_audit(n,'nc_closed',jsonb_build_object('action_id',a.id,'cycle',n.cycle),p_operation_id);
 elsif p_action='reopen' then
  if n.status<>'closed' or length(reason)<5 then raise exception 'Qualidade: Reabertura exige NC encerrada, permissão e motivo.' using errcode='22023';end if;
  update public.quality_nonconformities set cycle=cycle+1,status='analysis',closed_at=null,action_id=null where id=n.id returning * into n;
  perform private.quality_audit(n,'nc_reopened',jsonb_build_object('reason',reason,'previous_cycle',n.cycle-1),p_operation_id);
 elsif p_action='cancel' then
  if n.status in('closed','cancelled') or length(reason)<5 or a.state='running' then raise exception 'Qualidade: Cancele/finalize a ação em execução e informe motivo para cancelar a NC.' using errcode='22023';end if;
  if exists(select 1 from public.quality_materials where nc_id=n.id and reversed_at is null) or exists(select 1 from public.quality_costs k where k.nc_id=n.id and coalesce(private.quality_cost_actual(k),0)>0) or exists(select 1 from public.quality_costs k join public.financial_transactions f on f.id=k.financial_id and f.company_id=k.company_id where k.nc_id=n.id and f.cancelled_at is null) then raise exception 'Qualidade: Reverta os materiais, concilie custos e cancele as obrigações antes do cancelamento da NC.' using errcode='22023';end if;
  if exists(select 1 from public.quality_actions v join public.outsourcing_orders t on t.id=v.outsourcing_id and t.company_id=v.company_id where v.nc_id=n.id and t.status not in('received','cancelled')) or exists(select 1 from public.quality_actions v where v.nc_id=n.id and v.return_service_id is not null and not private.quality_return_resolved(c,v.return_service_id,v.return_run)) then raise exception 'Qualidade: Encerre/cancele OTs e retornos canônicos vinculados.' using errcode='22023';end if;
  if exists(select 1 from public.quality_evidence where nc_id=n.id and state='pending') then raise exception 'Qualidade: Remova uploads pendentes antes de cancelar.' using errcode='22023';end if;
  if a.state='planned' then update public.quality_actions set state='cancelled',result=reason,finished_at=clock_timestamp(),updated_at=clock_timestamp() where id=a.id;end if;
  update public.quality_nonconformities set status='cancelled',closed_at=clock_timestamp() where id=n.id returning * into n;
  perform private.quality_audit(n,'nc_cancelled',jsonb_build_object('reason',reason),p_operation_id);
 elsif p_action='file_reserve' then
  if p_payload->>'sha256' !~ '^[0-9a-f]{64}$' or p_payload->>'mime' not in('image/jpeg','image/png') or (p_payload->>'bytes')::integer not between 1 and 5242880 then raise exception 'Qualidade: Metadados de imagem inválidos.' using errcode='22023';end if;
  select * into evidence from public.quality_evidence where nc_id=n.id and cycle=n.cycle and actor=auth.uid() and sha256=p_payload->>'sha256' and caption=left(coalesce(p_payload->>'caption',''),300) and state<>'removed';
  if evidence.id is null then
   if (select count(*) from public.quality_evidence where nc_id=n.id and cycle=n.cycle and state<>'removed')>=25 then raise exception 'Qualidade: Limite de 25 evidências por ciclo.' using errcode='22023';end if;
   insert into public.quality_evidence(company_id,nc_id,cycle,path,sha256,bytes,mime,caption,actor,actor_name)
   values(c,n.id,n.cycle,c||'/'||n.id||'/'||n.cycle||'/'||gen_random_uuid()||case p_payload->>'mime' when 'image/png' then '.png' else '.jpg' end,p_payload->>'sha256',(p_payload->>'bytes')::integer,p_payload->>'mime',left(coalesce(p_payload->>'caption',''),300),auth.uid(),actor_row.name) returning * into evidence;
   perform private.quality_audit(n,'upload_reserved',jsonb_build_object('evidence_id',evidence.id),p_operation_id);
  elsif evidence.bytes<>(p_payload->>'bytes')::integer or evidence.mime<>p_payload->>'mime' then raise exception 'Qualidade: Conteúdo da reserva é incompatível.' using errcode='22023';end if;
  result:=jsonb_build_object('file',to_jsonb(evidence));
 elsif p_action='file_remove' then
  if length(reason)<5 then raise exception 'Qualidade: Remoção exige motivo auditável.' using errcode='22023';end if;
  select * into evidence from public.quality_evidence where company_id=c and nc_id=n.id and id=(p_payload->>'evidence_id')::uuid for update;
  if evidence.id is null then raise exception 'Qualidade: Evidência indisponível.' using errcode='P0002';end if;
  result:=jsonb_build_object('path',evidence.path);
  if evidence.state<>'removed' then update public.quality_evidence set state='removed',removed_at=clock_timestamp() where id=evidence.id;perform private.quality_audit(n,'evidence_removed',jsonb_build_object('evidence_id',evidence.id,'reason',reason),p_operation_id);end if;
 else raise exception 'Qualidade: Comando não reconhecido.' using errcode='22023';end if;
 update public.quality_nonconformities set updated_at=clock_timestamp() where id=n.id returning * into n;
 result:=result||jsonb_build_object('id',n.id,'company_id',c,'updated_at',n.updated_at,'action_id',n.action_id);
 insert into private.quality_commands values(c,p_operation_id,auth.uid(),p_action,p_payload,result);return result;
end$$;
revoke all on function public.quality_command(uuid,text,jsonb) from public,anon;
grant execute on function public.quality_command(uuid,text,jsonb) to authenticated;

create function public.quality_commit_upload(p_id uuid,p_actor uuid,p_sha text,p_bytes integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.quality_evidence%rowtype;n public.quality_nonconformities%rowtype;p public.profiles%rowtype;begin
 if auth.role() is distinct from 'service_role' then raise exception 'Sem permissão.' using errcode='42501';end if;
 select * into e from public.quality_evidence where id=p_id;
 select * into n from public.quality_nonconformities where id=e.nc_id and company_id=e.company_id;
 if n.order_id is not null then perform 1 from public.orders where company_id=n.company_id and id=n.order_id for update;elsif n.purchase_id is not null then perform 1 from public.purchase_orders where company_id=n.company_id and id=n.purchase_id for update;end if;
 select * into strict n from public.quality_nonconformities where id=e.nc_id and company_id=e.company_id for update;
 select * into strict e from public.quality_evidence where id=p_id for update;
 select * into p from public.profiles where auth_user_id=p_actor and active and company_id=e.company_id order by id limit 1;
 if p.id is null or e.actor<>p_actor or e.sha256<>p_sha or e.bytes<>p_bytes or not private.quality_profile_allowed(p.company_id,p.role,'/quality') or not (
  private.quality_profile_allowed(p.company_id,p.role,'/quality/manage') or private.quality_profile_allowed(p.company_id,p.role,'/quality/open') and n.created_by=p_actor or private.quality_profile_allowed(p.company_id,p.role,'/quality/execute') and (n.assigned_profile_id=p.id or n.team?p.id or exists(select 1 from public.quality_actions where id=n.action_id and assigned_profile_id=p.id))) then raise exception 'Sem permissão atual para finalizar esta evidência.' using errcode='42501';end if;
 if e.state='ready' then return jsonb_build_object('id',n.id);end if;
 perform private.saas_assert_write(n.company_id,null);
 if e.state<>'pending' or e.cycle<>n.cycle or n.status in('closed','cancelled') or not exists(select 1 from storage.objects where bucket_id='quality-evidence' and name=e.path) then raise exception 'Qualidade: Upload não pode ser finalizado neste ciclo.' using errcode='22023';end if;
 update public.quality_evidence set state='ready' where id=e.id;
 update public.quality_nonconformities set updated_at=clock_timestamp() where id=n.id returning * into n;
 perform private.quality_audit(n,'evidence_added',jsonb_build_object('evidence_id',e.id),null,p_actor);
 return jsonb_build_object('id',n.id,'updated_at',n.updated_at);
end$$;
revoke all on function public.quality_commit_upload(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.quality_commit_upload(uuid,uuid,text,integer) to service_role;
create function public.quality_file_access(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.quality_evidence%rowtype;begin
 select * into e from public.quality_evidence where id=p_id and company_id=private.current_company_id() and state='ready';
 if e.id is null or not private.quality_read(e.nc_id) then raise exception 'Sem permissão para evidência.' using errcode='42501';end if;
 return jsonb_build_object('path',e.path,'mime',e.mime,'nc_id',e.nc_id);
end$$;
revoke all on function public.quality_file_access(uuid) from public,anon;
grant execute on function public.quality_file_access(uuid) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('quality-evidence','quality-evidence',false,5242880,array['image/jpeg','image/png']);
create policy quality_evidence_read on storage.objects for select to authenticated using(bucket_id='quality-evidence' and exists(select 1 from public.quality_evidence e where e.path=name and e.state='ready' and private.quality_read(e.nc_id)));

create function private.quality_item_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.quality_nonconformities where order_id=old.order_id and order_item_id=old.id) and (tg_op='DELETE' or private.quality_item_physical(new) is distinct from private.quality_item_physical(old)) then raise exception 'Qualidade: Item com histórico de NC preserva a configuração técnica original.' using errcode='22023';end if;
 return case when tg_op='DELETE' then old else new end;
end$$;
revoke all on function private.quality_item_guard() from public,anon,authenticated;
create trigger quality_item_history_guard before update or delete on public.order_items for each row execute function private.quality_item_guard();
create function private.quality_material_product_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.quality_materials where product_id=old.id and company_id=old.company_id) and (tg_op='DELETE' or private.product_inventory_unit(new) is distinct from private.product_inventory_unit(old) or new.stock_controlled is distinct from old.stock_controlled or new.structure_type is distinct from old.structure_type) then raise exception 'Qualidade: Material com histórico preserva unidade e controle.' using errcode='22023';end if;
 return case when tg_op='DELETE' then old else new end;
end$$;
revoke all on function private.quality_material_product_guard() from public,anon,authenticated;
create trigger quality_material_history_guard before update or delete on public.products for each row execute function private.quality_material_product_guard();

-- An OT cannot be claimed directly and again inside an aggregated return cost.
-- All related canonical commands lock the Order; this additional advisory lock
-- also serializes trusted row writes before checking source attribution.
create function private.quality_cost_claim_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare refs uuid[];begin
 if tg_table_name='quality_costs' then
  if new.outsourcing_id is not null then refs:=array[new.outsourcing_id];
  elsif new.service_id is not null then select array_agg(distinct outsourcing_id) into refs from public.field_service_costs where company_id=new.company_id and service_id=new.service_id and run=new.service_run and outsourcing_id is not null;end if;
 else refs:=array[new.outsourcing_id];end if;
 if coalesce(cardinality(array_remove(refs,null)),0)=0 then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('quality-cost-source:'||new.company_id,0));
 if exists(with claims as(
  select 'quality:'||k.id::text as id,k.outsourcing_id as origin from public.quality_costs k where k.company_id=new.company_id and k.outsourcing_id=any(refs)
  union all
  select 'field:'||k.id::text||':'||f.id::text,f.outsourcing_id from public.quality_costs k join public.field_service_costs f on f.company_id=k.company_id and f.service_id=k.service_id and f.run=k.service_run where k.company_id=new.company_id and f.outsourcing_id=any(refs)
 )select 1 from claims group by origin having count(distinct id)>1) then raise exception 'Qualidade: OT já apropriada em outro custo de NC, diretamente ou no retorno. Use uma única origem para não duplicar valores.' using errcode='22023';end if;
 return new;
end$$;
revoke all on function private.quality_cost_claim_guard() from public,anon,authenticated;
create trigger quality_cost_source_once after insert or update of outsourcing_id,service_id,service_run on public.quality_costs for each row execute function private.quality_cost_claim_guard();
create trigger quality_return_cost_source_once after insert or update of outsourcing_id,service_id,run on public.field_service_costs for each row execute function private.quality_cost_claim_guard();

-- Opaque revision of closure facts. A private per-case random salt prevents
-- non-financial inspectors from guessing amounts from a numeric checksum.
create function private.quality_cost_version(p_nc uuid) returns text language sql stable security definer set search_path='' set timezone='UTC' as $$
 with ot_refs as (
  select outsourcing_id id from public.quality_actions where nc_id=p_nc
  union select outsourcing_id from public.quality_costs where nc_id=p_nc
  union select f.outsourcing_id from public.quality_costs k join public.field_service_costs f on f.company_id=k.company_id and f.service_id=k.service_id and f.run=k.service_run where k.nc_id=p_nc
 )
 select md5(s.secret::text||jsonb_build_object(
  'materials',(select coalesce(jsonb_agg(to_jsonb(m) order by id),'[]') from public.quality_materials m where nc_id=p_nc),
  'costs',(select coalesce(jsonb_agg(to_jsonb(k) order by id),'[]') from public.quality_costs k where nc_id=p_nc),
  'outsourcing',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'status',o.status,'actual',o.actual_cost,'freight',o.freight,'updated_at',o.updated_at) order by o.id),'[]') from public.outsourcing_orders o where id in(select id from ot_refs)),
  'receipts',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'quantity',r.quantity,'reversed_at',r.reversed_at) order by r.id),'[]') from public.outsourcing_receipts r where outsourcing_id in(select id from ot_refs)),
  'services',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'run',f.run,'status',f.status,'updated_at',f.updated_at) order by f.id),'[]') from public.field_services f where id in(select return_service_id from public.quality_actions where nc_id=p_nc)),
  'field_costs',(select coalesce(jsonb_agg(to_jsonb(f) order by f.id),'[]') from public.field_service_costs f where service_id in(select return_service_id from public.quality_actions where nc_id=p_nc)),
  'field_materials',(select coalesce(jsonb_agg(to_jsonb(f) order by f.id),'[]') from public.field_service_materials f where service_id in(select return_service_id from public.quality_actions where nc_id=p_nc)),
  'production',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') from public.production_queue q where id in(select production_id from public.quality_actions where nc_id=p_nc))
 )::text) from private.quality_cost_salts s where s.nc_id=p_nc
$$;
revoke all on function private.quality_cost_version(uuid) from public,anon,authenticated;

create function private.quality_requirements(n public.quality_nonconformities) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare i public.order_items%rowtype;quantity numeric;begin
 select * into i from public.order_items where order_id=n.order_id and id=n.order_item_id;
 if i.id is null then return '[]';end if;
 select a.quantity into quantity from public.quality_actions a where id=n.action_id;
 i.quantity:=coalesce(quantity,n.affected_quantity);
 return (select coalesce(jsonb_agg((r.component-'unit_cost')||jsonb_build_object('required',r.required)),'[]') from private.component_requirements(i) r);
end$$;
revoke all on function private.quality_requirements(public.quality_nonconformities) from public,anon,authenticated;

create function public.quality_source(p_from date default current_date-30,p_to date default current_date,p_id uuid default null,p_reports boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c text:=private.current_company_id();actor public.profiles%rowtype;ids uuid[];fin boolean;begin
 select * into actor from public.profiles where company_id=c and auth_user_id=auth.uid() and active order by id limit 1;
 if actor.id is null or not private.quality_allowed('/quality') then raise exception 'Sem permissão para Qualidade.' using errcode='42501';end if;
 if p_reports and not private.quality_reports(c) then raise exception 'Sem permissão atual para relatórios deste plano/perfil.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>365 then raise exception 'Qualidade: Período inválido, até 366 dias.' using errcode='22023';end if;
 select coalesce(array_agg(id),array[]::uuid[]) into ids from public.quality_nonconformities where company_id=c and case when p_id is null then (opened_at at time zone 'America/Bahia')::date between p_from and p_to else id=p_id end;
 if cardinality(ids)>5000 then raise exception 'Qualidade: Período muito movimentado; reduza o intervalo.' using errcode='54000';end if;
 if p_id is not null and not p_id=any(ids) then raise exception 'Qualidade: NC indisponível para sua empresa.' using errcode='P0002';end if;
 if p_id is not null and (select count(*) from public.quality_events where nc_id=p_id)>10000 then raise exception 'Qualidade: Histórico muito extenso para este documento.' using errcode='54000';end if;
 fin:=private.quality_finance();
 return jsonb_build_object('company_id',c,'profile_id',actor.id,'from',p_from,'to',p_to,'timezone','America/Bahia','report_mode',p_reports,
 'permissions',jsonb_build_object('open',private.quality_allowed('/quality/open'),'manage',private.quality_allowed('/quality/manage'),'execute',private.quality_allowed('/quality/execute'),'close',private.quality_allowed('/quality/close'),'reopen',private.quality_allowed('/quality/reopen'),'finance',fin,'reports',private.quality_reports(c),'stock',private.purchase_allowed('/stock'),'production',private.quality_allowed('/production'),'field_manage',private.fs_allowed('/field-services') and private.fs_allowed('/field-services/manage'),'writable',not coalesce((private.saas_state(c)->>'read_only')::boolean,false)),
 'cases',(select coalesce(jsonb_agg(to_jsonb(n)||jsonb_build_object('can_execute',private.quality_can_execute(n),'can_upload',private.quality_authorized('file_reserve',n),'cost_version',case when p_id is not null then private.quality_cost_version(n.id) end,'has_rework',exists(select 1 from public.quality_actions where nc_id=n.id and kind in('rework','reproduction') and started_at is not null),'action_kind',(select kind from public.quality_actions where id=n.action_id),'action_due_date',(select due_date from public.quality_actions where id=n.action_id),'action_supplier_id',(select supplier_id from public.quality_actions where id=n.action_id)) order by number desc),'[]') from public.quality_nonconformities n where id=any(ids)),
 'actions',(select coalesce(jsonb_agg(to_jsonb(a) order by version),'[]') from public.quality_actions a where nc_id=p_id),
 'materials',(select coalesce(jsonb_agg(case when fin then to_jsonb(m) else to_jsonb(m)-'unit_cost' end order by created_at),'[]') from public.quality_materials m where nc_id=p_id),
 'costs',case when fin then (select coalesce(jsonb_agg(to_jsonb(k)||jsonb_build_object('effective_actual',private.quality_cost_actual(k)) order by created_at),'[]') from public.quality_costs k where nc_id=p_id) else '[]'::jsonb end,
 'cost_history',case when fin then (select coalesce(jsonb_agg(to_jsonb(h) order by created_at),'[]') from public.quality_cost_history h where nc_id=p_id) else '[]'::jsonb end,
 'summaries',case when fin then (select coalesce(jsonb_object_agg(n.id,case when n.status='closed' then (select cost_snapshot-'materials'-'costs' from public.quality_closures where nc_id=n.id and cycle=n.cycle) else private.quality_cost_summary(n.id) end),'{}') from public.quality_nonconformities n where id=any(ids)) else '{}'::jsonb end,
 'current_summary',case when fin and p_id is not null then private.quality_cost_summary(p_id) end,
 'evidence',(select coalesce(jsonb_agg(to_jsonb(e) order by created_at),'[]') from public.quality_evidence e where nc_id=p_id),
 'reinspections',(select coalesce(jsonb_agg(to_jsonb(r) order by created_at),'[]') from public.quality_reinspections r where nc_id=p_id),
 'closures',(select coalesce(jsonb_agg(case when fin then to_jsonb(h) else to_jsonb(h)-'cost_snapshot' end order by cycle),'[]') from public.quality_closures h where nc_id=p_id),
 'events',(select coalesce(jsonb_agg(to_jsonb(e) order by created_at desc),'[]') from public.quality_events e where nc_id=p_id),
 'executions',(select coalesce(jsonb_agg(to_jsonb(x) order by execution_number),'[]') from public.production_executions x where production_id in(select production_id from public.quality_actions where nc_id=p_id)),
 'production',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from public.production_queue q where company_id=c and order_id in(select order_id from public.quality_nonconformities where id=p_id)),
 'requirements',(select private.quality_requirements(n) from public.quality_nonconformities n where id=p_id),
 'production_materials',(select coalesce(jsonb_agg(jsonb_build_object('product_id',m.product_id,'description',m.description,'quantity',m.quantity,'unit',m.unit,'reversed_at',x.reversed_at)),'[]') from public.component_consumptions x join public.component_consumption_items m on m.consumption_id=x.id and m.company_id=x.company_id where x.company_id=c and x.order_item_id in(select order_item_id from public.quality_nonconformities where id=p_id) and m.physical),
 'outsourcing',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'number',number,'status',status,'order_id',order_id,'order_item_id',order_item_id,'actual_cost',case when fin then actual_cost+freight end,'purchase_order_id',purchase_order_id)),'[]') from public.outsourcing_orders where company_id=c and id in(select outsourcing_id from public.quality_actions where nc_id=p_id)),
 'returns',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'number',number,'status',status,'run',run,'order_id',order_id,'order_item_id',order_item_id,'completed_at',completed_at)),'[]') from public.field_services where company_id=c and service_type='return' and order_id in(select order_id from public.quality_nonconformities where id=p_id)),
 'profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role,'can_execute',private.quality_profile_allowed(c,role,'/quality/execute')) order by name),'[]') from public.profiles where company_id=c and active and auth_user_id is not null),
 'suppliers',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]') from public.suppliers where company_id=c and active),
 'products',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'unit',private.product_inventory_unit(p),'current_stock',current_stock) order by name),'[]') from public.products p where company_id=c and private.purchase_allowed('/stock') and active and stock_controlled and structure_type='simple'),
 'accounts',case when fin then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') from public.financial_accounts where company_id=c and active) else '[]'::jsonb end,
 'categories',case when fin then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') from public.financial_categories where company_id=c and active and type='despesa') else '[]'::jsonb end,
 'transactions',case when fin then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'cancelled_at',cancelled_at,'amount',amount)),'[]') from public.financial_transactions where company_id=c and id in(select financial_id from public.quality_costs where nc_id=p_id)) else '[]'::jsonb end,
 'cohort',jsonb_build_object('orders_created',(select count(*) from public.orders where company_id=c and (created_at at time zone 'America/Bahia')::date between p_from and p_to),'orders_with_nc',(select count(*) from public.orders o where company_id=c and (created_at at time zone 'America/Bahia')::date between p_from and p_to and exists(select 1 from public.quality_nonconformities n where n.id=any(ids) and n.order_id=o.id and n.status<>'cancelled'))),
 'order_value',case when fin then (select sum(total_amount) from public.orders where company_id=c and id in(select order_id from public.quality_nonconformities where id=any(ids) and status<>'cancelled')) end);
end$$;
revoke all on function public.quality_source(date,date,uuid,boolean) from public,anon;
grant execute on function public.quality_source(date,date,uuid,boolean) to authenticated;

create function public.quality_origins(p_kind text,p_search text default '',p_offset integer default 0,p_id text default null,p_item text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c text:=private.current_company_id();rows jsonb;origin jsonb;options jsonb:='[]';items jsonb:='[]';needle text:='%'||left(coalesce(p_search,''),120)||'%';begin
 if not private.quality_allowed('/quality/open') then raise exception 'Sem permissão para abrir NC.' using errcode='42501';end if;
 if p_kind is null or p_kind not in('order','production','purchase','receipt','outsourcing','field_service') or p_offset is null or p_offset not between 0 and 50000 then raise exception 'Qualidade: Pesquisa de origem inválida.' using errcode='22023';end if;
 if p_id is not null then
  origin:=private.quality_origin(c,p_kind,p_id,p_item);
  if origin->>'order_id' is not null and p_kind in('order','field_service') then select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',product_name,'quantity',quantity) order by id),'[]') into items from public.order_items where order_id=origin->>'order_id';
  elsif origin->>'purchase_id' is not null and p_kind in('purchase','receipt') then select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.description,'quantity',i.quantity) order by position),'[]') into items from public.purchase_order_items i where company_id=c and order_id=(origin->>'purchase_id')::uuid and (p_kind<>'receipt' or exists(select 1 from public.purchase_receipt_items where company_id=c and receipt_id=(origin->>'receipt_id')::uuid and item_id=i.id));end if;
  return jsonb_build_object('origin',origin,'items',items);
 end if;
 if p_kind='order' then
  if not private.quality_allowed('/orders') then raise exception 'Sem permissão para Pedidos.' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select id,number||' · '||customer_name as label,status from public.orders where company_id=c and (number ilike needle or customer_name ilike needle) order by created_at desc,id limit 51 offset p_offset)x;
 elsif p_kind='production' then
  if not private.quality_allowed('/production') then raise exception 'Sem permissão para Produção.' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select id,order_number||' · '||product_name as label,status from public.production_queue where company_id=c and (order_number ilike needle or product_name ilike needle) order by created_at desc,id limit 51 offset p_offset)x;
 elsif p_kind in('purchase','receipt') then
  if not private.purchase_allowed('/purchases') then raise exception 'Sem permissão para Compras.' using errcode='42501';end if;
  if p_kind='purchase' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select id::text,'PC-'||lpad(number::text,4,'0')||' · '||(supplier_snapshot->>'name') as label,status from public.purchase_orders where company_id=c and ('PC-'||lpad(number::text,4,'0') ilike needle or supplier_snapshot->>'name' ilike needle) order by created_at desc,id limit 51 offset p_offset)x;
  else select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select r.id::text,'PC-'||lpad(o.number::text,4,'0')||' · Recebimento '||to_char(r.received_date,'DD/MM/YYYY')||' · '||(o.supplier_snapshot->>'name') as label,case when r.reversed_at is null then 'received' else 'reversed' end as status from public.purchase_receipts r join public.purchase_orders o on o.company_id=r.company_id and o.id=r.order_id where r.company_id=c and ('PC-'||lpad(o.number::text,4,'0') ilike needle or o.supplier_snapshot->>'name' ilike needle) order by r.created_at desc,r.id limit 51 offset p_offset)x;end if;
 elsif p_kind='outsourcing' then
  if not private.composite_allowed('/outsourcing') then raise exception 'Sem permissão para Terceirização.' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select id::text,'OT-'||lpad(number::text,4,'0')||' · '||(supplier_snapshot->>'name') as label,status from public.outsourcing_orders where company_id=c and ('OT-'||lpad(number::text,4,'0') ilike needle or supplier_snapshot->>'name' ilike needle) order by created_at desc,id limit 51 offset p_offset)x;
 else
  if not private.fs_allowed('/field-services') then raise exception 'Sem permissão para Serviços Externos.' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select id::text,'SE-'||lpad(number::text,4,'0')||' · '||title as label,status from public.field_services where company_id=c and private.fs_can_read(id) and ('SE-'||lpad(number::text,4,'0') ilike needle or title ilike needle) order by created_at desc,id limit 51 offset p_offset)x;
 end if;
 select coalesce(jsonb_agg(value),'[]') into options from jsonb_array_elements(rows) with ordinality as x(value,n) where n<=50;
 return jsonb_build_object('options',options,'has_more',jsonb_array_length(rows)>50,'offset',p_offset);
end$$;
revoke all on function public.quality_origins(text,text,integer,text,text) from public,anon;
grant execute on function public.quality_origins(text,text,integer,text,text) to authenticated;

create function public.quality_links(p_kind text,p_ids text[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c text:=private.current_company_id();rows jsonb;begin
 if not private.quality_allowed('/quality') then raise exception 'Sem permissão para Qualidade.' using errcode='42501';end if;
 if p_kind is null or p_kind not in('order','production','purchase','receipt','outsourcing','field_service','supplier','product') or cardinality(p_ids) is null or cardinality(p_ids)>200 then raise exception 'Qualidade: Vínculos inválidos; consulte até 200 referências.' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('reference_id',ref,'id',n.id,'number',n.number,'status',n.status,'severity',n.severity,'blocking',n.status not in('closed','cancelled') and(n.severity='critical' or n.block_completion),'source_type',n.source_type,'source_id',n.source_id,'order_id',n.order_id,'order_item_id',n.order_item_id,'description',n.description,'action_id',n.action_id) order by n.number desc),'[]') into rows
 from unnest(p_ids) refs(ref) join public.quality_nonconformities n on n.company_id=c and case p_kind
 when 'order' then n.order_id=ref
 when 'production' then exists(select 1 from public.production_queue q where q.company_id=c and q.id=ref and q.order_id=n.order_id and (n.order_item_id is null or n.order_item_id=q.order_item_id) and (n.production_id is null or n.production_id=q.id))
 when 'purchase' then n.purchase_id::text=ref when 'receipt' then n.receipt_id::text=ref
 when 'outsourcing' then n.outsourcing_id::text=ref or exists(select 1 from public.quality_actions where nc_id=n.id and outsourcing_id::text=ref)
 when 'field_service' then n.service_id::text=ref or exists(select 1 from public.quality_actions where nc_id=n.id and return_service_id::text=ref)
 when 'supplier' then n.supplier_id=ref or n.responsible_supplier_id=ref or exists(select 1 from public.quality_actions where nc_id=n.id and supplier_id=ref)
 when 'product' then n.product_id=ref end;
 if jsonb_array_length(rows)>5000 then raise exception 'Qualidade: Muitos vínculos; consulte uma referência específica.' using errcode='54000';end if;
 return jsonb_build_object('links',rows,'executions',(select coalesce(jsonb_agg(jsonb_build_object('reference_id',q.id,'execution_number',q.execution_number,'quantity',q.quantity,'quality_action_id',q.quality_action_id,'nc_id',a.nc_id,'number',n.number,'action_state',a.state)),'[]') from public.production_queue q left join public.quality_actions a on a.id=q.quality_action_id and a.company_id=q.company_id left join public.quality_nonconformities n on n.id=a.nc_id and n.company_id=q.company_id where p_kind='production' and q.company_id=c and q.id=any(p_ids)));
end$$;
revoke all on function public.quality_links(text,text[]) from public,anon;
grant execute on function public.quality_links(text,text[]) to authenticated;
