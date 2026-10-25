-- Canonical field execution. No manual agenda copies, vehicle stock or revenue engine.
create table public.field_services(
 id uuid primary key default gen_random_uuid(),company_id text not null references public.companies(id),number bigint not null,
 order_id text not null,customer_id text not null references public.customers(id),order_item_id text,production_id text,
 service_type text not null check(service_type in ('installation','technical_delivery','visit','measurement','maintenance','return')),
 status text not null default 'draft' check(status in ('draft','scheduled','traveling','on_site','running','blocked','completed','cancelled')),
 title text not null check(length(title) between 2 and 200),priority text not null default 'normal' check(priority in ('low','normal','high')),
 scheduled_start timestamptz,scheduled_end timestamptz,assigned_profile_id text references public.profiles(id),team jsonb not null default '[]',
 address_snapshot jsonb not null,customer_snapshot jsonb not null,order_snapshot jsonb not null,checklist jsonb not null default '[]',
 notes text not null default '' check(length(notes)<=5000),acceptance_required boolean not null default false,photo_required boolean not null default false,
 km_planned numeric(12,3) not null default 0 check(km_planned between 0 and 1000000),km_actual numeric(12,3) check(km_actual between 0 and 1000000),
 started_at timestamptz,completed_at timestamptz,run integer not null default 1 check(run>0),impediment jsonb,
 created_by uuid not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(company_id,order_id) references public.orders(company_id,id),
 foreign key(order_id,order_item_id) references public.order_items(order_id,id),
 foreign key(company_id,production_id) references public.production_queue(company_id,id),
 unique(company_id,id),unique(company_id,number),check(jsonb_typeof(team)='array' and jsonb_array_length(team)<=20),
 check(jsonb_typeof(checklist)='array' and jsonb_array_length(checklist)<=50),
 check(scheduled_end is null or scheduled_start is not null and scheduled_end>scheduled_start and scheduled_end<=scheduled_start+interval '7 days')
);
create unique index field_service_active_scope on public.field_services(company_id,order_id,coalesce(order_item_id,''),service_type) where status<>'cancelled';
create index field_service_schedule on public.field_services(company_id,scheduled_start,status);
create index field_service_assignee on public.field_services(company_id,assigned_profile_id);
create index field_service_customer on public.field_services(customer_id);
create index field_service_item on public.field_services(order_id,order_item_id);
create index field_service_production on public.field_services(company_id,production_id);
create table public.field_service_templates(
 id uuid primary key default gen_random_uuid(),company_id text not null references public.companies(id),name text not null check(length(name) between 2 and 160),
 service_type text not null check(service_type in ('installation','technical_delivery','visit','measurement','maintenance','return')),items jsonb not null,
 updated_at timestamptz not null default now(),unique(company_id,name),check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=50)
);
create table public.field_service_materials(
 id uuid primary key default gen_random_uuid(),company_id text not null,service_id uuid not null,product_id text not null,run integer not null default 1 check(run>0),
 description text not null,unit text not null,unit_cost numeric(18,6) not null check(unit_cost between 0 and 1000000000),
 planned numeric(18,6) not null check(planned>0 and planned<=1000000),taken numeric(18,6) not null default 0,
 consumed numeric(18,6) not null default 0,returned numeric(18,6) not null default 0,
 foreign key(company_id,service_id) references public.field_services(company_id,id),foreign key(company_id,product_id) references public.products(company_id,id),
 check(taken between 0 and 1000000 and consumed>=0 and returned>=0 and consumed+returned<=taken),unique(service_id,run,product_id)
);
create index field_material_service on public.field_service_materials(company_id,service_id);
create index field_material_product on public.field_service_materials(company_id,product_id);
create table public.field_service_costs(
 id uuid primary key default gen_random_uuid(),company_id text not null,service_id uuid not null,
 kind text not null check(kind in ('travel','toll','parking','third_party','expense')),description text not null check(length(description) between 2 and 300),
 planned numeric(14,2) not null default 0 check(planned between 0 and 9999999999),actual numeric(14,2) check(actual between 0 and 9999999999),
 outsourcing_id uuid,financial_id text references public.financial_transactions(id),financial_history jsonb not null default '[]' check(jsonb_typeof(financial_history)='array' and jsonb_array_length(financial_history)<=1000),
 foreign key(company_id,service_id) references public.field_services(company_id,id),foreign key(company_id,outsourcing_id) references public.outsourcing_orders(company_id,id),unique(financial_id)
);
create index field_cost_service on public.field_service_costs(company_id,service_id);
create index field_cost_outsource on public.field_service_costs(company_id,outsourcing_id);
create table public.field_service_evidence(
 id uuid primary key default gen_random_uuid(),company_id text not null,service_id uuid not null,run integer not null,
 kind text not null check(kind in ('before','during','after','problem','signature')),state text not null default 'pending' check(state in ('pending','ready','removed')),
 path text not null unique,sha256 text not null check(sha256~'^[0-9a-f]{64}$'),bytes integer not null check(bytes between 1 and 5242880),
 mime text not null check(mime in ('image/jpeg','image/png')),caption text not null default '' check(length(caption)<=300),
 acceptance jsonb,actor uuid not null,actor_name text not null,created_at timestamptz not null default now(),removed_at timestamptz,
 foreign key(company_id,service_id) references public.field_services(company_id,id)
);
create index field_evidence_service on public.field_service_evidence(company_id,service_id,run);
create table public.field_service_completions(
 id uuid primary key default gen_random_uuid(),company_id text not null,service_id uuid not null,run integer not null,snapshot jsonb not null,
 completed_at timestamptz not null default now(),actor uuid not null,foreign key(company_id,service_id) references public.field_services(company_id,id),unique(service_id,run)
);
create index field_completion_service on public.field_service_completions(company_id,service_id);
create table public.field_service_events(
 id uuid primary key default gen_random_uuid(),company_id text not null,service_id uuid not null,action text not null,details jsonb not null default '{}',
 recipients jsonb not null default '[]',actor uuid not null,actor_name text not null,created_at timestamptz not null default now(),
 foreign key(company_id,service_id) references public.field_services(company_id,id)
);
create index field_event_service on public.field_service_events(company_id,service_id,created_at);
create index field_event_recipients on public.field_service_events using gin(recipients);
create index field_event_notice on public.field_service_events(company_id,created_at desc) where action in('created','updated','assigned','scheduled','rescheduled','traveling','on_site','started','blocked','completed','reopened','cancelled');
create table private.field_service_commands(company_id text not null,operation_id uuid not null,actor uuid not null,action text not null,payload jsonb not null,result jsonb not null,primary key(company_id,operation_id));
create table private.field_service_counters(company_id text primary key references public.companies(id),number bigint not null);
alter table private.field_service_commands enable row level security;
alter table private.field_service_counters enable row level security;
revoke all on private.field_service_commands,private.field_service_counters from public,anon,authenticated;

create function private.fs_role_allowed(c text,r text,path text) returns boolean language sql stable security definer set search_path='' as $$
 select r=any(coalesce((select roles from public.role_permissions where company_id=c and public.role_permissions.path=$3),case path
 when '/field-services' then array['admin','gerente','financeiro','vendas','producao','estoque']
 when '/field-services/manage' then array['admin','gerente']
 when '/field-services/execute' then array['admin','gerente','producao','estoque']
 when '/field-services/reopen' then array['admin','gerente']
 when '/field-services/view-all' then array['admin','gerente','financeiro','vendas','estoque'] else array[]::text[] end))
$$;
revoke all on function private.fs_role_allowed(text,text,text) from public,anon,authenticated;
create function private.fs_allowed(path text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select private.fs_role_allowed(company_id,role,path) from public.profiles where auth_user_id=auth.uid() and active order by id limit 1),false)
$$;
grant execute on function private.fs_allowed(text) to authenticated;
revoke all on function private.fs_allowed(text) from public,anon;
create function private.fs_can_read(sid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.field_services s join public.profiles p on p.company_id=s.company_id and p.auth_user_id=auth.uid() and p.active
 where s.id=sid and private.fs_role_allowed(p.company_id,p.role,'/field-services') and
 (private.fs_role_allowed(p.company_id,p.role,'/field-services/view-all') or s.assigned_profile_id=p.id or s.team ? p.id))
$$;
revoke all on function private.fs_can_read(uuid) from public,anon;
grant execute on function private.fs_can_read(uuid) to authenticated;
create function private.fs_writable(c text) returns void language plpgsql security definer set search_path='' as $$
begin if coalesce((private.saas_state(c)->>'read_only')::boolean,false) then raise exception 'Billing: Assinatura somente leitura.' using errcode='42501';end if;end $$;
revoke all on function private.fs_writable(text) from public,anon,authenticated;
create function private.fs_reports_allowed(c text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if not private.composite_allowed('/reports') then return false;end if;
 begin perform private.saas_assert_read(c,'reports');exception when insufficient_privilege then return false;end;
 return true;
end $$;
revoke all on function private.fs_reports_allowed(text) from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['field_services','field_service_materials','field_service_costs','field_service_evidence','field_service_completions','field_service_events','field_service_templates'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);
 if t='field_services' then execute format('create policy field_read on public.%I for select to authenticated using (private.fs_can_read(id))',t);
 elsif t='field_service_templates' then execute format('create policy field_read on public.%I for select to authenticated using(company_id=(select private.current_company_id()) and (select private.fs_allowed(''/field-services'')))',t);
 elsif t='field_service_costs' then execute format('create policy field_read on public.%I for select to authenticated using(private.fs_can_read(service_id) and (select private.finance_can_access()))',t);
 elsif t='field_service_events' then execute format('create policy field_read on public.%I for select to authenticated using(private.fs_can_read(service_id))',t);
 else execute format('create policy field_read on public.%I for select to authenticated using(private.fs_can_read(service_id))',t);end if;
 end loop;end $$;
create function private.fs_audit(s public.field_services,a text,d jsonb,op uuid,targets jsonb default null,p_actor uuid default auth.uid()) returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype;begin
 select * into strict p from public.profiles where auth_user_id=p_actor and company_id=s.company_id and active order by id limit 1;
 insert into public.field_service_events(company_id,service_id,action,details,recipients,actor,actor_name)
 values(s.company_id,s.id,a,jsonb_build_object('number',s.number,'title',s.title,'status',s.status)||d,coalesce(targets,'[]')||s.team||case when s.assigned_profile_id is null then '[]'::jsonb else jsonb_build_array(s.assigned_profile_id) end,p_actor,p.name);
 insert into public.audit_logs(company_id,actor_user_id,actor_profile_id,actor_name,actor_role,action,entity_type,entity_id,module,new_values,metadata)
 values(s.company_id,p_actor,p.id,p.name,p.role,'field_service.'||a,'field_services',s.id::text,'field-services',d,jsonb_build_object('operation_id',op,'run',s.run));
end $$;
revoke all on function private.fs_audit(public.field_services,text,jsonb,uuid,jsonb,uuid) from public,anon,authenticated;
create function private.fs_checklist(v jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare x jsonb;ids text[]:=array[]::text[];begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>50 then raise exception 'Serviço: Checklist inválido.' using errcode='22023';end if;
 for x in select value from jsonb_array_elements(v) loop
 if length(btrim(coalesce(x->>'label',''))) not between 1 and 160 or coalesce(x->>'id','')!~'^[a-zA-Z0-9-]{1,64}$' or x->>'id'=any(ids) or jsonb_typeof(x->'required') is distinct from 'boolean' or jsonb_typeof(x->'done') is distinct from 'boolean' then raise exception 'Serviço: Item de checklist inválido.' using errcode='22023';end if;ids:=array_append(ids,x->>'id');
 end loop;return (select coalesce(jsonb_agg(jsonb_build_object('id',entry->>'id','label',btrim(entry->>'label'),'required',(entry->>'required')::boolean,'done',(entry->>'done')::boolean)),'[]') from jsonb_array_elements(v) entry);
end $$;
revoke all on function private.fs_checklist(jsonb) from public,anon,authenticated;

-- Unit costs are available only through the financial projection, never a technician's direct SELECT.
revoke select on public.field_service_materials from authenticated;
grant select(id,company_id,service_id,run,product_id,description,unit,planned,taken,consumed,returned) on public.field_service_materials to authenticated;
create function private.fs_authorized_action(s public.field_services,action text) returns boolean language sql stable security definer set search_path='' as $$
 select private.fs_can_read(s.id) and case
 when action='reopen' then private.fs_allowed('/field-services/reopen')
 when action in ('save','cancel','file_remove','material_reverse') then private.fs_allowed('/field-services/manage')
 when action in ('cost_save','cost_export','cost_cancel') then private.finance_can_access()
 when action in ('schedule','reschedule','material_add','material_take','material_settle','material_reverse','file_reserve') and private.fs_allowed('/field-services/manage') then true
 else private.fs_allowed('/field-services/execute') and (private.fs_allowed('/field-services/manage') or exists(select 1 from public.profiles where company_id=s.company_id and auth_user_id=auth.uid() and active and (id=s.assigned_profile_id or s.team ? id))) end
$$;
revoke all on function private.fs_authorized_action(public.field_services,text) from public,anon,authenticated;
create function private.fs_team_valid(s public.field_services) returns boolean language sql stable security definer set search_path='' as $$
 select s.assigned_profile_id is not null and not exists(select 1 from jsonb_array_elements_text(s.team||jsonb_build_array(s.assigned_profile_id)) member where not exists(select 1 from public.profiles p where p.company_id=s.company_id and p.id=member and p.active and p.auth_user_id is not null and private.fs_role_allowed(s.company_id,p.role,'/field-services/execute')))
$$;
revoke all on function private.fs_team_valid(public.field_services) from public,anon,authenticated;

create function public.field_service_command(p_operation_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c text:=private.current_company_id();actor public.profiles%rowtype;s public.field_services%rowtype;o public.orders%rowtype;
 receipt private.field_service_commands%rowtype;old public.field_services%rowtype;material_row public.field_service_materials%rowtype;product_row public.products%rowtype;
 cost public.field_service_costs%rowtype;financial_row public.financial_transactions%rowtype;file public.field_service_evidence%rowtype;
 target text;service_title text;previous_financial_id text;financial_history jsonb;sid uuid;oid text;num bigint;v jsonb;result jsonb;v_team jsonb;cl jsonb;q numeric;cons numeric;ret numeric;item text;prod text;addr jsonb;start_at timestamptz;end_at timestamptz;manage boolean;can_execute boolean;reason text:=btrim(coalesce(p_payload->>'reason',''));
begin
 select * into actor from public.profiles where auth_user_id=auth.uid() and company_id=c and active order by id limit 1;
 if not found or not private.fs_allowed('/field-services') then raise exception 'Sem permissão para Serviços Externos.' using errcode='42501';end if;
 perform private.fs_writable(c);
 if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>150000 then raise exception 'Serviço: Comando inválido.' using errcode='22023';end if;
 if p_payload ? 'company_id' then raise exception 'Sem permissão para informar empresa.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(c||p_operation_id::text,0));
 select * into receipt from private.field_service_commands where company_id=c and operation_id=p_operation_id;
 if found then
 if receipt.actor<>auth.uid() or receipt.action<>p_action or receipt.payload<>p_payload then raise exception 'Serviço: Chave reutilizada com outro comando.' using errcode='22023';end if;
 if p_action='template_save' then if not private.fs_allowed('/field-services/manage') then raise exception 'Sem permissão para modelos.' using errcode='42501';end if;
 else select * into s from public.field_services where company_id=c and id=(receipt.result->>'id')::uuid;if not found or not private.fs_authorized_action(s,p_action) then raise exception 'Sem permissão atual para esta operação.' using errcode='42501';end if;end if;
 return receipt.result;end if;
 manage:=private.fs_allowed('/field-services/manage');
 if p_action='template_save' then
 if not manage then raise exception 'Sem permissão para modelos.' using errcode='42501';end if;
 cl:=private.fs_checklist(p_payload->'items');
 if p_payload->>'id' is not null then perform 1 from public.field_service_templates where id=(p_payload->>'id')::uuid and company_id=c and updated_at=(p_payload->>'updated_at')::timestamptz for update;if not found then raise exception 'Serviço: Modelo mudou.' using errcode='40001';end if;end if;
 insert into public.field_service_templates(id,company_id,name,service_type,items) values(coalesce((p_payload->>'id')::uuid,gen_random_uuid()),c,btrim(p_payload->>'name'),p_payload->>'service_type',cl)
 on conflict(id) do update set name=excluded.name,service_type=excluded.service_type,items=excluded.items,updated_at=clock_timestamp() returning jsonb_build_object('id',id) into result;
 insert into public.audit_logs(company_id,actor_user_id,actor_profile_id,actor_name,actor_role,action,entity_type,entity_id,module,metadata)
 values(c,auth.uid(),actor.id,actor.name,actor.role,'field_service.template_saved','field_service_templates',result->>'id','field-services',jsonb_build_object('operation_id',p_operation_id,'name',p_payload->>'name','items',jsonb_array_length(cl)));
 else
 sid:=nullif(p_payload->>'id','')::uuid;
 if sid is null and p_action<>'save' then raise exception 'Serviço: Informe o serviço existente.' using errcode='22023';end if;
 if sid is not null then select order_id into oid from public.field_services where company_id=c and id=sid;if not found or not private.fs_can_read(sid) then raise exception 'Serviço indisponível.' using errcode='P0002';end if;else oid:=p_payload->>'order_id';end if;
 select * into o from public.orders where company_id=c and id=oid for update;
 if not found then raise exception 'Serviço: Pedido inválido para sua empresa.' using errcode='22023';end if;
 if sid is not null then
 select * into strict s from public.field_services where company_id=c and id=sid for update;old:=s;
 if s.updated_at is distinct from (p_payload->>'updated_at')::timestamptz then raise exception 'Serviço mudou. Atualize antes de continuar.' using errcode='40001';end if;
 end if;
 can_execute:=private.fs_allowed('/field-services/execute') and (manage or s.assigned_profile_id=actor.id or s.team ? actor.id);
 if sid is not null and (s.status='completed' and p_action not in ('reopen','file_remove','cost_save','cost_export','cost_cancel') or s.status='cancelled' and p_action not in ('file_remove','cost_cancel')) then raise exception 'Serviço encerrado preserva histórico. Use reabertura autorizada.' using errcode='22023';end if;
 if o.status='cancelado' and p_action not in ('cancel','material_reverse','cost_cancel','file_remove') then raise exception 'Serviço: Pedido cancelado.' using errcode='22023';end if;
 if p_action='save' then
 if not manage or sid is not null and s.status not in ('draft','scheduled') then raise exception 'Sem permissão para editar este serviço.' using errcode='42501';end if;
 service_title:=btrim(coalesce(p_payload->>'title',''));if length(service_title) not between 2 and 200 then raise exception 'Serviço: Informe uma descrição entre2 e 200 caracteres.' using errcode='22023';end if;
 if sid is not null and (p_payload->>'order_id' is distinct from s.order_id or nullif(p_payload->>'order_item_id','') is distinct from s.order_item_id or nullif(p_payload->>'production_id','') is distinct from s.production_id or p_payload->>'service_type' is distinct from s.service_type) then raise exception 'Serviço: Origem preservada; crie outra operação.' using errcode='22023';end if;
 item:=nullif(p_payload->>'order_item_id','');prod:=nullif(p_payload->>'production_id','');
 if not exists(select 1 from public.customers where company_id=c and id=o.customer_id) then raise exception 'Serviço: Cliente inválido para sua empresa.' using errcode='22023';end if;
 if item is not null and not exists(select 1 from public.order_items where order_id=o.id and id=item) then raise exception 'Serviço: Item inválido.' using errcode='22023';end if;
 if prod is not null and not exists(select 1 from public.production_queue where company_id=c and order_id=o.id and id=prod and (item is null or order_item_id=item)) then raise exception 'Serviço: Produção inválida.' using errcode='22023';end if;
 addr:=p_payload->'address';if jsonb_typeof(addr) is distinct from 'object' or length(btrim(coalesce(addr->>'street',''))) not between 2 and 200 or length(btrim(coalesce(addr->>'city',''))) not between 2 and 120 or coalesce(addr->>'state','')!~'^[A-Z]{2}$' or length(btrim(coalesce(addr->>'number',''))) not between 1 and 30 or length(addr::text)>2000 then raise exception 'Serviço: Informe endereço estruturado válido.' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(addr) entry where entry.key in('zip_code','street','number','complement','neighborhood','city','state','reference') and jsonb_typeof(entry.value) not in('string','null')) or nullif(addr->>'zip_code','') is not null and addr->>'zip_code' !~ '^[0-9]{5}-?[0-9]{3}$' then raise exception 'Serviço: Confira os campos do endereço e o CEP opcional.' using errcode='22023';end if;
 addr:=jsonb_build_object('street',btrim(addr->>'street'),'number',btrim(addr->>'number'),'city',btrim(addr->>'city'),'state',addr->>'state','zip_code',btrim(coalesce(addr->>'zip_code','')),'complement',btrim(coalesce(addr->>'complement','')),'neighborhood',btrim(coalesce(addr->>'neighborhood','')),'reference',btrim(coalesce(addr->>'reference','')));
 v_team:=coalesce(p_payload->'team','[]');if jsonb_typeof(v_team)<>'array' or jsonb_array_length(v_team)>20 then raise exception 'Serviço: Equipe inválida.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements_text(v_team||case when nullif(p_payload->>'assigned_profile_id','') is null then '[]'::jsonb else jsonb_build_array(p_payload->>'assigned_profile_id') end) x where not exists(select 1 from public.profiles eligible where eligible.id=x and eligible.company_id=c and eligible.active and eligible.auth_user_id is not null and private.fs_role_allowed(c,eligible.role,'/field-services/execute'))) then raise exception 'Serviço: Técnico não elegível.' using errcode='22023';end if;
 cl:=private.fs_checklist(coalesce(p_payload->'checklist','[]'));
 if sid is null then
 select id into sid from public.field_services where company_id=c and order_id=o.id and coalesce(order_item_id,'')=coalesce(item,'') and service_type=p_payload->>'service_type' and status<>'cancelled';
 if sid is not null then result:=jsonb_build_object('id',sid,'reused',true);else
 insert into private.field_service_counters values(c,1) on conflict(company_id) do update set number=private.field_service_counters.number+1 returning number into num;
 insert into public.field_services(company_id,number,order_id,customer_id,order_item_id,production_id,service_type,title,priority,address_snapshot,customer_snapshot,order_snapshot,assigned_profile_id,team,checklist,notes,km_planned,acceptance_required,photo_required,created_by)
 values(c,num,o.id,o.customer_id,item,prod,p_payload->>'service_type',service_title,coalesce(p_payload->>'priority','normal'),addr,
 (select jsonb_build_object('name',name,'phone',phone) from public.customers where company_id=c and id=o.customer_id),jsonb_build_object('number',o.number,'item_name',(select product_name from public.order_items where id=item and order_id=o.id)),nullif(p_payload->>'assigned_profile_id',''),v_team,cl,coalesce(p_payload->>'notes',''),coalesce((p_payload->>'km_planned')::numeric,0),coalesce((p_payload->>'acceptance_required')::boolean,false),coalesce((p_payload->>'photo_required')::boolean,false),auth.uid()) returning * into s;
 perform private.fs_audit(s,'created','{}',p_operation_id);sid:=s.id;end if;
 else
 update public.field_services set title=service_title,priority=coalesce(p_payload->>'priority','normal'),address_snapshot=addr,assigned_profile_id=nullif(p_payload->>'assigned_profile_id',''),team=v_team,checklist=cl,notes=coalesce(p_payload->>'notes',''),km_planned=coalesce((p_payload->>'km_planned')::numeric,0),acceptance_required=coalesce((p_payload->>'acceptance_required')::boolean,false),photo_required=coalesce((p_payload->>'photo_required')::boolean,false),updated_at=clock_timestamp() where id=sid returning * into s;
 perform private.fs_audit(s,case when old.assigned_profile_id is distinct from s.assigned_profile_id or old.team<>s.team then 'assigned' else 'updated' end,'{}',p_operation_id,old.team||coalesce(jsonb_build_array(old.assigned_profile_id),'[]'));
 end if;
 elsif p_action in ('schedule','reschedule') then
 if not manage and not can_execute then raise exception 'Sem permissão para agendar.' using errcode='42501';end if;
 start_at:=(p_payload->>'start')::timestamptz;end_at:=(p_payload->>'end')::timestamptz;
 if not private.fs_team_valid(s) then raise exception 'Serviço: Defina responsável e equipe ativos e elegíveis.' using errcode='22023';end if;
 if start_at is null or end_at is null or not isfinite(start_at) or not isfinite(end_at) or end_at<=start_at or end_at>start_at+interval '7 days' or s.assigned_profile_id is null or (p_action='reschedule' and length(reason)<5) then raise exception 'Serviço: Informe janela, responsável e motivo do reagendamento.' using errcode='22023';end if;
 if p_action='schedule' and s.status<>'draft' or p_action='reschedule' and s.status not in ('scheduled','traveling','on_site','running','blocked') then raise exception 'Serviço: Transição de agendamento inválida.' using errcode='22023';end if;
 update public.field_services set scheduled_start=start_at,scheduled_end=end_at,status='scheduled',started_at=null,impediment=null,updated_at=clock_timestamp() where id=s.id returning * into s;
 perform private.fs_audit(s,case when p_action='schedule' then 'scheduled' else 'rescheduled' end,jsonb_build_object('before_start',old.scheduled_start,'start',start_at,'end',end_at,'reason',reason),p_operation_id);
 elsif p_action='transition' then
 if not can_execute then raise exception 'Sem permissão para executar este serviço.' using errcode='42501';end if;
 target:=p_payload->>'status';
 if not private.fs_team_valid(s) then raise exception 'Serviço: Equipe mudou; revise os responsáveis antes de executar.' using errcode='22023';end if;
 if not (s.status='scheduled' and target='traveling' or s.status='traveling' and target='on_site' or s.status in ('on_site','blocked') and target='running') then raise exception 'Serviço: Transição inválida.' using errcode='22023';end if;
 if s.service_type in ('installation','technical_delivery') and target='traveling' and
 (exists(select 1 from public.production_queue where company_id=c and order_id=s.order_id and (case when s.production_id is not null then id=s.production_id when s.order_item_id is not null then order_item_id=s.order_item_id else true end) and status not in ('concluido','expedicao','entregue','finalizado')) or not exists(select 1 from public.production_queue where company_id=c and order_id=s.order_id and (case when s.production_id is not null then id=s.production_id when s.order_item_id is not null then order_item_id=s.order_item_id else true end)) and o.status not in ('expedicao','entregue','finalizado')) then raise exception 'Serviço: Confirme a produção pronta antes de sair.' using errcode='22023';end if;
 update public.field_services set status=target,started_at=case when target='running' then coalesce(started_at,clock_timestamp()) else started_at end,updated_at=clock_timestamp() where id=s.id returning * into s;
 perform private.fs_audit(s,case when target='running' then 'started' else target end,'{}',p_operation_id);
 elsif p_action='checklist' then
 if not can_execute then raise exception 'Sem permissão para checklist.' using errcode='42501';end if;
 if not exists(select 1 from jsonb_array_elements(s.checklist) x where x->>'id'=p_payload->>'item') or jsonb_typeof(p_payload->'done') is distinct from 'boolean' then raise exception 'Serviço: Item de checklist inválido.' using errcode='22023';end if;
 update public.field_services set checklist=(select jsonb_agg(case when x->>'id'=p_payload->>'item' then x||jsonb_build_object('done',p_payload->'done') else x end) from jsonb_array_elements(checklist) x),updated_at=clock_timestamp() where id=s.id returning * into s;
 perform private.fs_audit(s,'checklist_updated',jsonb_build_object('item',p_payload->>'item','done',p_payload->'done'),p_operation_id);
 elsif p_action='impediment' then
 if not can_execute or s.status not in ('traveling','on_site','running') then raise exception 'Sem permissão para registrar impedimento nesta etapa.' using errcode='42501';end if;
 if length(reason)<5 or p_payload->>'kind' not in ('absent','site','access','material','technical','weather','other') then raise exception 'Serviço: Informe motivo e observação do impedimento.' using errcode='22023';end if;
 update public.field_services set status='blocked',impediment=jsonb_build_object('kind',p_payload->>'kind','reason',reason,'at',clock_timestamp(),'actor',auth.uid()),updated_at=clock_timestamp() where id=s.id returning * into s;perform private.fs_audit(s,'blocked',s.impediment,p_operation_id);
 elsif p_action='travel' then
 if not can_execute then raise exception 'Sem permissão para deslocamento.' using errcode='42501';end if;
 update public.field_services set km_actual=(p_payload->>'km_actual')::numeric,updated_at=clock_timestamp() where id=s.id returning * into s;perform private.fs_audit(s,'travel_updated',jsonb_build_object('km_actual',s.km_actual,'note',left(p_payload->>'note',1000)),p_operation_id);
 elsif p_action='material_add' then
 if not manage and not can_execute then raise exception 'Sem permissão para materiais.' using errcode='42501';end if;
 select * into product_row from public.products where company_id=c and id=p_payload->>'product_id' and active and stock_controlled and structure_type='simple' for share;
 if not found then raise exception 'Serviço: Selecione material físico adicional do Estoque.' using errcode='22023';end if;
 q:=(p_payload->>'quantity')::numeric;if q is null or q<=0 or q>1000000 or q<>round(q,6) then raise exception 'Serviço: Quantidade prevista positiva, até seis casas decimais.' using errcode='22023';end if;
 insert into public.field_service_materials(company_id,service_id,run,product_id,description,unit,unit_cost,planned) values(c,s.id,s.run,product_row.id,product_row.name,private.product_inventory_unit(product_row),private.product_reference_cost(product_row),q)
 on conflict(service_id,run,product_id) do update set planned=excluded.planned where public.field_service_materials.taken<=excluded.planned returning id into sid;
 if not found then raise exception 'Serviço: Previsto não pode ser menor que o material já levado.' using errcode='22023';end if;
 perform private.fs_audit(s,'material_added',jsonb_build_object('material_id',sid),p_operation_id);
 elsif p_action in ('material_take','material_settle','material_reverse') then
 if not can_execute and not manage then raise exception 'Sem permissão para materiais.' using errcode='42501';end if;
 select * into material_row from public.field_service_materials where company_id=c and service_id=s.id and id=(p_payload->>'material_id')::uuid for update;if not found then raise exception 'Serviço: Material indisponível.' using errcode='P0002';end if;
 if material_row.run<>s.run and p_action<>'material_reverse' then raise exception 'Serviço: Registre materiais adicionais na execução atual.' using errcode='22023';end if;
 if p_action='material_take' then
 q:=(p_payload->>'quantity')::numeric;if q is null or q<=0 or q>material_row.planned-material_row.taken or q<>round(q,6) then raise exception 'Serviço: Quantidade levada excede o previsto.' using errcode='22023';end if;
 v:=private.move_inventory(c,material_row.product_id,q,'saida','Materiais adicionais · SE-'||lpad(s.number::text,4,'0'),material_row.unit_cost);
 update public.field_service_materials set taken=taken+q where id=material_row.id;
 elsif p_action='material_settle' then
 cons:=coalesce((p_payload->>'consumed')::numeric,0);ret:=coalesce((p_payload->>'returned')::numeric,0);
 if cons<0 or ret<0 or cons+ret<=0 or cons+ret>material_row.taken-material_row.consumed-material_row.returned or cons<>round(cons,6) or ret<>round(ret,6) then raise exception 'Serviço: Consumo e sobra excedem o levado.' using errcode='22023';end if;
 if ret>0 then v:=private.move_inventory(c,material_row.product_id,ret,'entrada','Sobra de campo · SE-'||lpad(s.number::text,4,'0'),material_row.unit_cost);end if;
 update public.field_service_materials set consumed=consumed+cons,returned=returned+ret where id=material_row.id;
 else
 if not manage or length(reason)<5 then raise exception 'Serviço: Reversão exige gestor e motivo do retorno físico ou correção.' using errcode='22023';end if;
 q:=material_row.taken-material_row.returned;if q>0 then v:=private.move_inventory(c,material_row.product_id,q,'entrada','Inverso de campo · SE-'||lpad(s.number::text,4,'0')||' · '||reason,material_row.unit_cost);end if;
 update public.field_service_materials set taken=0,consumed=0,returned=0 where id=material_row.id;
 end if;
 if v is not null and v->>'status'<>'UPDATED' then raise exception 'Serviço: Estoque insuficiente ou material indisponível.' using errcode='22023';end if;
 perform private.fs_audit(s,p_action,jsonb_build_object('material_id',material_row.id,'material_run',material_row.run,'quantity',q,'consumed',cons,'returned',ret,'reason',reason),p_operation_id);
 elsif p_action in ('cost_save','cost_export','cost_cancel') then
 if not private.finance_can_access() then raise exception 'Sem permissão para custos financeiros.' using errcode='42501';end if;
 if p_payload->>'cost_id' is not null then select * into cost from public.field_service_costs where company_id=c and service_id=s.id and id=(p_payload->>'cost_id')::uuid for update;if not found then raise exception 'Serviço: Custo indisponível.' using errcode='P0002';end if;end if;
 if p_action='cost_save' then
 if length(btrim(coalesce(p_payload->>'description',''))) not between 2 and 300 then raise exception 'Serviço: Informe descrição válida do custo.' using errcode='22023';end if;
 if p_payload->>'kind'='third_party' and p_payload->>'outsourcing_id' is null or p_payload->>'kind'<>'third_party' and p_payload->>'outsourcing_id' is not null then raise exception 'Serviço: Custo de terceiro exige uma OT canônica vinculada.' using errcode='22023';end if;
 if cost.financial_id is not null and (not exists(select 1 from public.financial_transactions where id=cost.financial_id and company_id=c and cancelled_at is not null) or length(reason)<5) then raise exception 'Serviço: Cancele a obrigação canônica e informe motivo para corrigir o custo.' using errcode='22023';end if;
 previous_financial_id:=cost.financial_id;financial_history:=coalesce(cost.financial_history,'[]')||case when previous_financial_id is not null then jsonb_build_array(previous_financial_id) else '[]'::jsonb end;
 if p_payload->>'outsourcing_id' is not null and not exists(select 1 from public.outsourcing_orders where company_id=c and order_id=s.order_id and id=(p_payload->>'outsourcing_id')::uuid) then raise exception 'Serviço: OT inválida para o Pedido.' using errcode='22023';end if;
 insert into public.field_service_costs(id,company_id,service_id,kind,description,planned,actual,outsourcing_id,financial_history) values(coalesce(cost.id,gen_random_uuid()),c,s.id,p_payload->>'kind',btrim(p_payload->>'description'),coalesce((p_payload->>'planned')::numeric,0),(p_payload->>'actual')::numeric,(p_payload->>'outsourcing_id')::uuid,financial_history)
 on conflict(id) do update set kind=excluded.kind,description=excluded.description,planned=excluded.planned,actual=excluded.actual,outsourcing_id=excluded.outsourcing_id,financial_id=null,financial_history=excluded.financial_history returning * into cost;
 elsif p_action='cost_export' then
 if cost.id is null or cost.outsourcing_id is not null or cost.actual is null or cost.actual<=0 then raise exception 'Serviço: Use Compra da OT para terceiros; informe despesa efetiva positiva.' using errcode='22023';end if;
 if cost.financial_id is not null and exists(select 1 from public.financial_transactions where id=cost.financial_id and company_id=c and cancelled_at is not null) then raise exception 'Serviço: Corrija o custo após o cancelamento antes de gerar outra obrigação.' using errcode='22023';end if;
 if cost.financial_id is null then
 v:=public.finance_command(gen_random_uuid(),'payable_create',jsonb_build_object('account_id',p_payload->>'account_id','category_id',p_payload->>'category_id','amount',cost.actual,'date',p_payload->>'date','description','SE-'||lpad(s.number::text,4,'0')||' · '||cost.description,'method','pix','pay_now',false));
 update public.field_service_costs set financial_id=v#>>'{transaction,id}' where id=cost.id returning * into cost;end if;
 else
 if cost.financial_id is not null then select * into financial_row from public.financial_transactions where id=cost.financial_id and company_id=c for update;
 if financial_row.cancelled_at is null then perform public.finance_command(gen_random_uuid(),'payable_cancel',jsonb_build_object('id',financial_row.id,'updated_at',financial_row.updated_at));end if;end if;
 end if;
 perform private.fs_audit(s,p_action,jsonb_build_object('cost_id',cost.id,'financial_id',cost.financial_id,'previous_financial_id',previous_financial_id,'reason',reason),p_operation_id);
 elsif p_action='file_reserve' then
 if not can_execute and not manage then raise exception 'Sem permissão para evidências.' using errcode='42501';end if;
 if (select count(*) from public.field_service_evidence where service_id=s.id and run=s.run and state<>'removed')>=25 then raise exception 'Serviço: Limite de 25 arquivos por execução.' using errcode='22023';end if;
 if p_payload->>'kind'='signature' and (p_payload#>>'{acceptance,consent}' is distinct from 'true' or length(btrim(coalesce(p_payload#>>'{acceptance,name}',''))) not between 2 and 160 or length(coalesce(p_payload#>>'{acceptance,document}',''))>40 or exists(select 1 from public.field_service_evidence where service_id=s.id and run=s.run and kind='signature' and state<>'removed')) then raise exception 'Serviço: Informe nome e consentimento; existe no máximo um aceite por execução.' using errcode='22023';end if;
 if p_payload->>'mime' is distinct from (case when p_payload->>'kind'='signature' then 'image/png' else 'image/jpeg' end) then raise exception 'Serviço: Formato normalizado inválido.' using errcode='22023';end if;
 insert into public.field_service_evidence(company_id,service_id,run,kind,path,sha256,bytes,mime,caption,acceptance,actor,actor_name)
 values(c,s.id,s.run,p_payload->>'kind',c||'/'||s.id::text||'/'||p_operation_id::text||case when p_payload->>'kind'='signature' then '.png' else '.jpg' end,p_payload->>'sha256',(p_payload->>'bytes')::integer,p_payload->>'mime',coalesce(p_payload->>'caption',''),case when p_payload->>'kind'='signature' then jsonb_build_object('name',btrim(p_payload#>>'{acceptance,name}'),'document',left(p_payload#>>'{acceptance,document}',40),'consent',true,'text','Confirmo a execução/recebimento do serviço descrito.','at',clock_timestamp()) end,auth.uid(),actor.name) returning * into file;
 result:=jsonb_build_object('id',s.id,'file',to_jsonb(file));perform private.fs_audit(s,'evidence_reserved',jsonb_build_object('evidence_id',file.id,'kind',file.kind),p_operation_id);
 elsif p_action='file_remove' then
 select * into file from public.field_service_evidence where company_id=c and service_id=s.id and id=(p_payload->>'evidence_id')::uuid for update;
 if not found or not manage or length(reason)<5 or s.status='completed' then raise exception 'Serviço: Remoção exige gestor, motivo e execução aberta ou cancelada.' using errcode='22023';end if;
 update public.field_service_evidence set state='removed',removed_at=clock_timestamp() where id=file.id;result:=jsonb_build_object('id',s.id,'path',file.path);perform private.fs_audit(s,'evidence_removed',jsonb_build_object('evidence_id',file.id,'reason',reason),p_operation_id);
 elsif p_action='complete' then
 if not can_execute or s.status<>'running' then raise exception 'Serviço: Inicie a execução para concluir.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(s.checklist) x where (x->>'required')::boolean and not (x->>'done')::boolean) then raise exception 'Serviço: Checklist obrigatório pendente.' using errcode='22023';end if;
 if exists(select 1 from public.field_service_materials where service_id=s.id and run=s.run and taken<>consumed+returned) then raise exception 'Serviço: Concilie materiais levados, consumidos e retornados.' using errcode='22023';end if;
 if exists(select 1 from public.field_service_evidence where service_id=s.id and run=s.run and state='pending') then raise exception 'Serviço: Conclua ou remova uploads pendentes.' using errcode='22023';end if;
 if s.acceptance_required and not exists(select 1 from public.field_service_evidence where service_id=s.id and run=s.run and kind='signature' and state='ready') or s.photo_required and not exists(select 1 from public.field_service_evidence where service_id=s.id and run=s.run and kind='after' and state='ready') then raise exception 'Serviço: Foto final ou aceite obrigatório pendente.' using errcode='22023';end if;
 update public.field_services set status='completed',completed_at=clock_timestamp(),updated_at=clock_timestamp() where id=s.id returning * into s;
 insert into public.field_service_completions(company_id,service_id,run,snapshot,actor) values(c,s.id,s.run,jsonb_build_object('service',to_jsonb(s),'team',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') from public.profiles where company_id=c and (id=s.assigned_profile_id or s.team ? id)),'materials',(select coalesce(jsonb_agg(to_jsonb(snapshot_material)-'unit_cost'),'[]') from public.field_service_materials snapshot_material where service_id=s.id and run=s.run),'evidence',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from public.field_service_evidence e where service_id=s.id and run=s.run and state='ready'),'note',left(p_payload->>'note',5000)),auth.uid());
 perform private.fs_audit(s,'completed',jsonb_build_object('note',left(p_payload->>'note',5000)),p_operation_id);
 elsif p_action='reopen' then
 if not private.fs_allowed('/field-services/reopen') or s.status<>'completed' or length(reason)<5 then raise exception 'Serviço: Reabertura exige gestor, conclusão anterior e motivo.' using errcode='42501';end if;
 update public.field_services set status='scheduled',run=run+1,started_at=null,completed_at=null,checklist=(select coalesce(jsonb_agg(x||'{"done":false}'::jsonb),'[]') from jsonb_array_elements(checklist) x),updated_at=clock_timestamp() where id=s.id returning * into s;perform private.fs_audit(s,'reopened',jsonb_build_object('reason',reason,'previous_run',old.run),p_operation_id);
 elsif p_action='cancel' then
 if not manage or length(reason)<5 then raise exception 'Serviço: Cancelamento exige gestor e motivo.' using errcode='42501';end if;
 if exists(select 1 from public.field_service_evidence where service_id=s.id and state='pending') then raise exception 'Serviço: Remova uploads pendentes antes de cancelar.' using errcode='22023';end if;
 if exists(select 1 from public.field_service_materials where service_id=s.id and taken<>returned) or exists(select 1 from public.field_service_costs k join public.financial_transactions ledger_tx on ledger_tx.id=k.financial_id where k.service_id=s.id and ledger_tx.cancelled_at is null) then raise exception 'Serviço: Reverta materiais e cancele obrigações antes de cancelar.' using errcode='22023';end if;
 update public.field_services set status='cancelled',updated_at=clock_timestamp() where id=s.id returning * into s;perform private.fs_audit(s,'cancelled',jsonb_build_object('reason',reason),p_operation_id);
 else raise exception 'Serviço: Comando desconhecido.' using errcode='22023';end if;
 if s.id is not null and p_action not in ('save','schedule','reschedule','transition','impediment','travel','complete','reopen','cancel') then update public.field_services set updated_at=clock_timestamp() where id=s.id returning * into s;end if;
 result:=coalesce(result,jsonb_build_object('id',coalesce(s.id,sid)))||jsonb_build_object('company_id',c,'updated_at',s.updated_at);
 end if;
 insert into private.field_service_commands values(c,p_operation_id,auth.uid(),p_action,p_payload,result);return result;
end $$;
revoke all on function public.field_service_command(uuid,text,jsonb) from public,anon;
grant execute on function public.field_service_command(uuid,text,jsonb) to authenticated;

create function public.field_service_source(p_from date default current_date-31,p_to date default current_date+31,p_id uuid default null,p_order text default null,p_notices boolean default false,p_reports boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare c text:=private.current_company_id();a public.profiles%rowtype;ids uuid[];fin boolean;begin
 select * into a from public.profiles where auth_user_id=auth.uid() and company_id=c and active order by id limit 1;
 if not found or not private.fs_allowed('/field-services') then raise exception 'Sem permissão para Serviços Externos.' using errcode='42501';end if;
 if p_reports then if not private.composite_allowed('/reports') then raise exception 'Sem permissão para relatórios.' using errcode='42501';end if;perform private.saas_assert_read(c,'reports');end if;
 if p_notices then return jsonb_build_object('notices',(select coalesce(jsonb_agg(to_jsonb(n)),'[]') from (select id,service_id,action,details->>'number' as number,case when private.fs_can_read(service_id) then details->>'title' else 'Sua participação neste serviço foi alterada.' end as title,private.fs_can_read(service_id) as can_open,created_at from public.field_service_events where company_id=c and recipients ? a.id and action in('created','updated','assigned','scheduled','rescheduled','traveling','on_site','started','blocked','completed','reopened','cancelled') and created_at>now()-interval '7 days' order by created_at desc limit 20)n));end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>365 then raise exception 'Serviço: Período inválido, até 366 dias.' using errcode='22023';end if;
 fin:=private.finance_can_access();
 select coalesce(array_agg(id),array[]::uuid[]) into ids from public.field_services s where company_id=c and private.fs_can_read(s.id) and
 (case when p_id is not null then s.id=p_id when p_order is not null then s.order_id=p_order else scheduled_start<(p_to+1)::timestamp at time zone 'America/Bahia' and scheduled_end>=p_from::timestamp at time zone 'America/Bahia' or scheduled_start is null and (created_at at time zone 'America/Bahia')::date between p_from and p_to end);
 if cardinality(ids)>5000 then raise exception 'Serviço: Período muito movimentado; reduza o intervalo.' using errcode='54000';end if;
 if p_id is not null and not p_id=any(ids) then raise exception 'Serviço indisponível.' using errcode='P0002';end if;
 if (select count(*) from public.field_service_events where service_id=any(ids))>10000 then raise exception 'Serviço: Histórico muito movimentado; consulte um serviço específico.' using errcode='54000';end if;
 return jsonb_build_object('company_id',c,'profile_id',a.id,'report_mode',p_reports,'permissions',jsonb_build_object('manage',private.fs_allowed('/field-services/manage'),'execute',private.fs_allowed('/field-services/execute'),'reopen',private.fs_allowed('/field-services/reopen'),'finance',fin,'reports',private.fs_reports_allowed(c),'writable',not coalesce((private.saas_state(c)->>'read_only')::boolean,false)),
 'services',(select coalesce(jsonb_agg(to_jsonb(s) order by scheduled_start nulls last,number desc),'[]') from public.field_services s where id=any(ids)),
 'materials',(select coalesce(jsonb_agg(case when fin then to_jsonb(m) else to_jsonb(m)-'unit_cost' end),'[]') from public.field_service_materials m where service_id=any(ids)),
 'costs',case when fin then (select coalesce(jsonb_agg(to_jsonb(k)),'[]') from public.field_service_costs k where service_id=any(ids)) else '[]'::jsonb end,
 'evidence',(select coalesce(jsonb_agg(to_jsonb(e) order by created_at),'[]') from public.field_service_evidence e where service_id=any(ids)),
 'completions',(select coalesce(jsonb_agg(to_jsonb(h) order by run desc),'[]') from public.field_service_completions h where service_id=any(ids)),
 'events',(select coalesce(jsonb_agg(to_jsonb(e) order by created_at desc),'[]') from public.field_service_events e where service_id=any(ids)),
 'templates',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.field_service_templates t where company_id=c),
 'profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role,'phone',phone,'avatar_url',avatar_url)),'[]') from public.profiles where company_id=c and active and auth_user_id is not null and private.fs_role_allowed(c,role,'/field-services/execute')),
 'orders',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'number',number,'customer_id',customer_id,'customer_name',customer_name,'status',status,'delivery_address',delivery_address)),'[]') from public.orders where company_id=c and (private.fs_allowed('/field-services/manage') or id in(select order_id from public.field_services where id=any(ids))) and (status<>'cancelado' or id=p_order)),
 'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'order_id',i.order_id,'product_name',i.product_name)),'[]') from public.order_items i join public.orders o on o.id=i.order_id where o.company_id=c and (private.fs_allowed('/field-services/manage') or o.id in(select order_id from public.field_services where id=any(ids)))),
 'production',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'order_id',order_id,'order_item_id',order_item_id,'product_name',product_name,'status',status)),'[]') from public.production_queue where company_id=c and (private.fs_allowed('/field-services/manage') or order_id in(select order_id from public.field_services where id=any(ids)))),
 'production_materials',(select coalesce(jsonb_agg(jsonb_build_object('order_id',x.order_id,'product_id',m.product_id,'description',m.description,'quantity',m.quantity,'unit',m.unit)),'[]') from public.component_consumptions x join public.component_consumption_items m on m.consumption_id=x.id and m.company_id=x.company_id where x.company_id=c and x.reversed_at is null and m.physical and x.order_id in(select order_id from public.field_services where id=any(ids))),
 'customers',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'address',address)),'[]') from public.customers where company_id=c and (private.fs_allowed('/field-services/manage') or id in(select customer_id from public.field_services where id=any(ids)))),
 'products',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'unit',private.product_inventory_unit(p),'current_stock',current_stock)),'[]') from public.products p where company_id=c and active and stock_controlled and structure_type='simple'),
 'outsourcing',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'order_id',order_id,'number',number,'status',status,'purchase_order_id',purchase_order_id)),'[]') from public.outsourcing_orders where company_id=c and private.composite_allowed('/outsourcing')),
 'accounts',case when fin then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') from public.financial_accounts where company_id=c and active) else '[]'::jsonb end,
 'categories',case when fin then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') from public.financial_categories where company_id=c and active and type='despesa') else '[]'::jsonb end,
 'transactions',case when fin then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'cancelled_at',cancelled_at,'status',status,'amount',amount)),'[]') from public.financial_transactions where company_id=c and id in(select financial_id from public.field_service_costs where service_id=any(ids))) else '[]'::jsonb end);
end $$;
revoke all on function public.field_service_source(date,date,uuid,text,boolean,boolean) from public,anon;
grant execute on function public.field_service_source(date,date,uuid,text,boolean,boolean) to authenticated;

-- Trusted server finalization: the browser cannot claim an object was uploaded.
create function public.field_service_commit_upload(p_id uuid,p_actor uuid,p_sha text,p_bytes integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.field_service_evidence%rowtype;s public.field_services%rowtype;p public.profiles%rowtype;begin
 if auth.role() is distinct from 'service_role' then raise exception 'Sem permissão.' using errcode='42501';end if;
 select * into e from public.field_service_evidence where id=p_id;
 perform 1 from public.orders where company_id=e.company_id and id=(select order_id from public.field_services where id=e.service_id) for update;
 select * into strict s from public.field_services where id=e.service_id for update;
 select * into strict e from public.field_service_evidence where id=p_id for update;
 select * into p from public.profiles where auth_user_id=p_actor and active and company_id=e.company_id order by id limit 1;
 if not found or e.actor<>p_actor or e.sha256<>p_sha or e.bytes<>p_bytes then raise exception 'Sem permissão para finalizar arquivo.' using errcode='42501';end if;
 if not private.fs_role_allowed(p.company_id,p.role,'/field-services') or not (private.fs_role_allowed(p.company_id,p.role,'/field-services/manage') or private.fs_role_allowed(p.company_id,p.role,'/field-services/execute') and (s.assigned_profile_id=p.id or s.team ? p.id)) then raise exception 'Sem permissão para esta execução.' using errcode='42501';end if;
 if e.state='ready' then return jsonb_build_object('id',s.id);end if;
 perform private.fs_writable(s.company_id);
 if e.state<>'pending' or e.run<>s.run or s.status in ('completed','cancelled') or not exists(select 1 from storage.objects where bucket_id='field-service-evidence' and name=e.path) then raise exception 'Serviço: Upload não pode ser finalizado nesta execução.' using errcode='22023';end if;
 update public.field_service_evidence set state='ready' where id=e.id;
 update public.field_services set updated_at=clock_timestamp() where id=s.id returning * into s;
 perform private.fs_audit(s,'evidence_added',jsonb_build_object('evidence_id',e.id,'kind',e.kind),null,null,p_actor);
 return jsonb_build_object('id',s.id,'updated_at',s.updated_at);
end $$;
revoke all on function public.field_service_commit_upload(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.field_service_commit_upload(uuid,uuid,text,integer) to service_role;
create function public.field_service_file_access(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.field_service_evidence%rowtype;begin
 select * into e from public.field_service_evidence where id=p_id and company_id=private.current_company_id() and state='ready';
 if not found or not private.fs_can_read(e.service_id) then raise exception 'Sem permissão para evidência.' using errcode='42501';end if;
 return jsonb_build_object('path',e.path,'mime',e.mime,'kind',e.kind,'service_id',e.service_id);
end $$;
revoke all on function public.field_service_file_access(uuid) from public,anon;
grant execute on function public.field_service_file_access(uuid) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('field-service-evidence','field-service-evidence',false,5242880,array['image/jpeg','image/png']);
create policy field_private_evidence on storage.objects for select to authenticated using(bucket_id='field-service-evidence' and exists(select 1 from public.field_service_evidence e where e.path=name and e.state='ready' and private.fs_can_read(e.service_id)));

create function private.fs_order_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then return old;end if;
 if new.customer_id is distinct from old.customer_id and exists(select 1 from public.field_services where order_id=old.id) then raise exception 'Serviço: Pedido com histórico preserva o cliente.' using errcode='22023';end if;
 if new.status='cancelado' and old.status<>'cancelado' and exists(select 1 from public.field_services where order_id=old.id and status not in ('completed','cancelled')) then raise exception 'Serviço: Cancele serviços externos pendentes antes do Pedido.' using errcode='22023';end if;return new;
end $$;
revoke all on function private.fs_order_guard() from public,anon,authenticated;
create trigger field_service_order_guard before update on public.orders for each row execute function private.fs_order_guard();
create function private.fs_product_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.field_service_materials where product_id=old.id and company_id=old.company_id) and (tg_op='DELETE' or private.product_inventory_unit(new) is distinct from private.product_inventory_unit(old) or new.stock_controlled is distinct from old.stock_controlled or new.structure_type is distinct from old.structure_type) then raise exception 'Serviço: Material com histórico preserva unidade e controle.' using errcode='22023';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.fs_product_guard() from public,anon,authenticated;
create trigger field_material_product_guard before update or delete on public.products for each row execute function private.fs_product_guard();
create function private.fs_item_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or new.product_id is distinct from old.product_id or new.quantity is distinct from old.quantity or (coalesce(new.details,'{}')-'notes') is distinct from (coalesce(old.details,'{}')-'notes') then
 begin perform 1 from public.orders where id=old.order_id for update nowait;exception when lock_not_available then raise exception 'Serviço: Pedido em alteração. Atualize antes de continuar.' using errcode='40001';end;
 if exists(select 1 from public.field_services where order_id=old.order_id and order_item_id=old.id) then raise exception 'Serviço: Item com histórico externo preserva produto, quantidade e configuração.' using errcode='22023';end if;end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.fs_item_guard() from public,anon,authenticated;
create trigger field_item_history_guard before update or delete on public.order_items for each row execute function private.fs_item_guard();
