-- SaaS billing is deliberately separate from operational Finance. QA only.
create table public.saas_plans (
 id uuid primary key default gen_random_uuid(),code text not null unique check(code ~ '^[a-z0-9_-]{3,40}$'),
 name text not null check(length(btrim(name)) between 1 and 80),description text not null default '' check(length(description)<=500),
 active boolean not null default true,monthly_price numeric(12,2) not null check(monthly_price>=0),annual_price numeric(12,2) not null check(annual_price>=0),
 trial_days integer not null default 7 check(trial_days between 1 and 30),sort_order integer not null default 0,
 features jsonb not null check(jsonb_typeof(features)='object'),limits jsonb not null check(jsonb_typeof(limits)='object'),
 qa_only boolean not null default true check(qa_only),revision integer not null default 1,updated_at timestamptz not null default now()
);
create table public.saas_subscriptions (
 id uuid primary key default gen_random_uuid(),company_id text not null unique references public.companies(id),plan_id uuid not null references public.saas_plans(id),
 status text not null check(status in ('trial','active','past_due','grace','cancelled','expired')),
 billing_cycle text not null check(billing_cycle in ('monthly','yearly')),started_at timestamptz not null default now(),
 trial_ends_at timestamptz,current_period_start timestamptz not null,current_period_end timestamptz not null,billing_anchor integer check(billing_anchor between 1 and 31),
 grace_ends_at timestamptz,cancel_at_period_end boolean not null default false,cancelled_at timestamptz,
 provider text not null default 'mock' check(provider='mock'),environment text not null default 'qa' check(environment='qa'),
 real_billing_enabled boolean not null default false check(not real_billing_enabled),provider_subscription_id text not null unique,
 contract jsonb not null,revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(current_period_end>current_period_start),unique(company_id,id)
);
create index saas_subscription_plan on public.saas_subscriptions(plan_id);
create index saas_subscription_status_end on public.saas_subscriptions(status,current_period_end);
create table public.saas_subscription_events (
 id uuid primary key default gen_random_uuid(),company_id text not null references public.companies(id),subscription_id uuid not null,
 event_id text not null unique,action text not null,revision integer not null,actor uuid not null,
 before_state jsonb not null,after_state jsonb not null,created_at timestamptz not null default now(),
 foreign key(company_id,subscription_id) references public.saas_subscriptions(company_id,id),unique(subscription_id,revision)
);
create index saas_event_tenant_date on public.saas_subscription_events(company_id,created_at desc);
create table private.saas_billing_qa_tenants(company_id text primary key references public.companies(id),label text not null check(length(label)>3));
create table private.saas_billing_config(id boolean primary key default true check(id),grace_days integer not null default 3 check(grace_days between 1 and 14),secret text not null);
insert into private.saas_billing_config values(true,3,encode(extensions.gen_random_bytes(48),'hex'));
create table private.saas_billing_commands (
 id uuid primary key,company_id text not null references public.companies(id),actor uuid not null,action text not null,payload jsonb not null,
 expected_revision integer not null,prepared jsonb not null,applied boolean not null default false,result jsonb,created_at timestamptz not null default now()
);
create index saas_command_tenant on private.saas_billing_commands(company_id);
alter table private.saas_billing_commands enable row level security;
alter table private.saas_billing_qa_tenants enable row level security;
alter table private.saas_billing_config enable row level security;
revoke all on private.saas_billing_commands,private.saas_billing_qa_tenants,private.saas_billing_config from public,anon,authenticated;

create function private.saas_manage(c text,actor uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$
 select actor is not null and exists(select 1 from public.profiles p left join public.role_permissions r on r.company_id=p.company_id and r.path='/settings'
 where p.company_id=c and p.auth_user_id=actor and p.active and p.role='admin' and p.role=any(coalesce(r.roles,array['admin','gerente']::text[])))
$$;
revoke all on function private.saas_manage(text,uuid) from public,anon,authenticated;
create function private.saas_audit(c text,a text,eid text,actor uuid,summary jsonb) returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype;begin
 if actor is not null then select * into p from public.profiles where company_id=c and auth_user_id=actor and active order by id limit 1;
 if not found then raise exception 'Billing denied' using errcode='42501';end if;end if;
 insert into public.audit_logs(company_id,actor_user_id,actor_profile_id,actor_name,actor_role,action,entity_type,entity_id,module,new_values)
 values(c,actor,p.id,case when actor is null then 'SYSTEM' else p.name end,case when actor is null then 'system' else p.role end,a,'saas_subscription',eid,'saas_billing',summary);
end $$;
revoke all on function private.saas_audit(text,text,text,uuid,jsonb) from public,anon,authenticated;

-- One canonical resolver. No subscription means legacy/unmanaged, not a free plan.
create function private.saas_state(c text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.saas_subscriptions%rowtype;st text;ro boolean;begin
 select * into s from public.saas_subscriptions where company_id=c;
 if not found then return jsonb_build_object('managed',false,'status','unmanaged','read_only',false,'features',jsonb_build_object('catalog',true,'finance',true,'reports',true,'commissions',true,'payment_links',true,'fiscal',true,'advanced_media',true),'limits','{}'::jsonb);end if;
 st:=s.status;
 if st not in ('cancelled','expired') then
 if s.cancel_at_period_end and now()>=s.current_period_end then st:='cancelled';
 elsif st='trial' and now()>=s.trial_ends_at then st:='expired';
 elsif st in ('past_due','grace') and now()>=s.grace_ends_at then st:='expired';
 elsif st='active' and now()>=s.current_period_end then
 st:=case when now()<s.current_period_end+make_interval(days=>coalesce((select grace_days from private.saas_billing_config where id),3)) then 'grace' else 'expired' end;
 end if;end if;
 ro:=st in ('cancelled','expired');
 return jsonb_build_object('managed',true,'status',st,'read_only',ro,'features',s.contract->'features','limits',s.contract->'limits','subscription_id',s.id,'revision',s.revision);
end $$;
revoke all on function private.saas_state(text) from public,anon,authenticated;
create function private.saas_assert_write(c text,feature text default null) returns void language plpgsql security definer set search_path='' as $$
declare model jsonb;begin
 model:=private.saas_state(c);
 if (model->>'read_only')::boolean then raise exception 'Billing: Assinatura em modo somente leitura. Seus dados e exportações estão preservados.' using errcode='42501';end if;
 if feature is not null and not coalesce((model#>>array['features',feature])::boolean,false) then raise exception 'Billing: Recurso indisponível no plano. Consulte Plano e Assinatura.' using errcode='42501';end if;
end $$;
revoke all on function private.saas_assert_write(text,text) from public,anon,authenticated;

create function public.saas_billing_access() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c text:=private.current_company_id();begin
 if c is null or auth.uid() is null then raise exception 'Billing denied' using errcode='42501';end if;
 return private.saas_state(c)||jsonb_build_object('canManage',private.saas_manage(c),'qa_enabled',exists(select 1 from private.saas_billing_qa_tenants where company_id=c),'real_billing_enabled',false);
end $$;
revoke all on function public.saas_billing_access() from public,anon;
grant execute on function public.saas_billing_access() to authenticated;
create function public.saas_billing_assert(p_feature text default null) returns void language plpgsql security definer set search_path='' as $$
declare c text:=private.current_company_id();begin
 if c is null or auth.uid() is null then raise exception 'Billing denied' using errcode='42501';end if;
 if p_feature is not null and p_feature not in ('catalog','finance','reports','commissions','payment_links','fiscal','advanced_media') then raise exception 'Billing denied' using errcode='42501';end if;
 perform private.saas_assert_write(c,p_feature);
end $$;
revoke all on function public.saas_billing_assert(text) from public,anon;
grant execute on function public.saas_billing_assert(text) to authenticated;

create function private.saas_plan_valid(p jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(p->'features')='object' and jsonb_typeof(p->'limits')='object'
 and not exists(select 1 from jsonb_each(p->'features') x where x.key not in ('catalog','finance','reports','commissions','payment_links','fiscal','advanced_media') or jsonb_typeof(x.value)<>'boolean')
 and not exists(select 1 from jsonb_each(p->'limits') x where x.key not in ('users','products') or not(case when x.value='null'::jsonb then true when jsonb_typeof(x.value)='number' and x.value::text ~ '^[0-9]{1,6}$' then x.value::text::integer>=1 else false end))
$$;
revoke all on function private.saas_plan_valid(jsonb) from public,anon,authenticated;
create function public.saas_plan_admin(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.saas_plans%rowtype;begin
 -- No platform admin exists. This boundary is service-only; never exposed in tenant UI.
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Billing denied' using errcode='42501';end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Billing: Dados inválidos.' using errcode='22023';end if;
 if p_action is null or p_action not in ('save','deactivate','order') then raise exception 'Billing: Ação inválida.' using errcode='22023';end if;
 if p_data ? 'id' then select * into p from public.saas_plans where id=(p_data->>'id')::uuid for update;
 if not found or p.revision is distinct from (p_data->>'revision')::integer then raise exception 'Billing: Plano alterado. Atualize.' using errcode='40001';end if;end if;
 if p_action='save' then
 if not coalesce(private.saas_plan_valid(p_data),false) then raise exception 'Billing: Recursos ou limites inválidos.' using errcode='22023';end if;
 if p.id is null then
 insert into public.saas_plans(code,name,description,monthly_price,annual_price,trial_days,features,limits,sort_order)
 values(p_data->>'code',p_data->>'name',coalesce(p_data->>'description',''),(p_data->>'monthly_price')::numeric,(p_data->>'annual_price')::numeric,coalesce((p_data->>'trial_days')::integer,7),p_data->'features',p_data->'limits',coalesce((p_data->>'sort_order')::integer,0)) returning * into p;
 else update public.saas_plans set name=p_data->>'name',description=coalesce(p_data->>'description',''),monthly_price=(p_data->>'monthly_price')::numeric,annual_price=(p_data->>'annual_price')::numeric,trial_days=(p_data->>'trial_days')::integer,features=p_data->'features',limits=p_data->'limits',active=coalesce((p_data->>'active')::boolean,active),sort_order=coalesce((p_data->>'sort_order')::integer,sort_order),revision=revision+1,updated_at=clock_timestamp() where id=p.id returning * into p;end if;
 elsif p.id is null then raise exception 'Billing: Plano indisponível.' using errcode='22023';
 elsif p_action='deactivate' then update public.saas_plans set active=false,revision=revision+1,updated_at=clock_timestamp() where id=p.id returning * into p;
 else update public.saas_plans set sort_order=(p_data->>'sort_order')::integer,revision=revision+1,updated_at=clock_timestamp() where id=p.id returning * into p;end if;
 return to_jsonb(p);
end $$;
revoke all on function public.saas_plan_admin(text,jsonb) from public,anon,authenticated;
grant execute on function public.saas_plan_admin(text,jsonb) to service_role;

insert into public.saas_plans(code,name,description,monthly_price,annual_price,trial_days,features,limits,sort_order) values
 ('qa-essential','Essencial · QA','Plano demonstrativo para teste de limites e recursos; não é oferta comercial.',29,290,7,'{"catalog":true,"finance":true,"reports":false,"commissions":false,"payment_links":false,"fiscal":false,"advanced_media":false}','{"users":2,"products":2}',1),
 ('qa-complete','Completo · QA','Plano demonstrativo com os recursos implementados; cobrança real bloqueada.',59,590,7,'{"catalog":true,"finance":true,"reports":true,"commissions":true,"payment_links":true,"fiscal":true,"advanced_media":true}','{"users":10,"products":100}',2);

create function private.saas_period_end(d timestamptz,cycle text,anchor integer) returns timestamptz language sql immutable set search_path='' as $$
 with m as(select date_trunc('month',d at time zone 'UTC')+case when cycle='yearly' then interval '12 months' else interval '1 month' end as start)
 select (start+make_interval(days=>least(anchor,extract(day from start+interval '1 month - 1 day')::integer)-1)+(d at time zone 'UTC'-date_trunc('day',d at time zone 'UTC'))) at time zone 'UTC' from m
$$;
revoke all on function private.saas_period_end(timestamptz,text,integer) from public,anon,authenticated;
create function public.saas_billing_prepare(p_action text,p_payload jsonb,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c text:=private.current_company_id();s public.saas_subscriptions%rowtype;p public.saas_plans%rowtype;cmd private.saas_billing_commands%rowtype;prepared jsonb;begin
 if c is null or not private.saas_manage(c) then raise exception 'Billing denied' using errcode='42501';end if;
 if coalesce(p_payload->>'provider','mock')<>'mock' or coalesce(p_payload->>'environment','qa')<>'qa' or coalesce(p_payload->>'real_billing_enabled','false')<>'false' then raise exception 'SAAS_REAL_BILLING_REQUIRES_EXPLICIT_AUTHORIZATION' using errcode='22023';end if;
 if not exists(select 1 from private.saas_billing_qa_tenants where company_id=c) then raise exception 'Billing: Simulações permitidas somente em tenant QA habilitado.' using errcode='42501';end if;
 if p_operation_id is null or p_action is null or p_action not in ('start_trial','activate','change_plan','renew','payment_failed','grace','cancel','reactivate','expire') or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>2048 then raise exception 'Billing: Solicitação inválida.' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('plan_id','plan_revision','cycle','revision','provider','environment','real_billing_enabled')) then raise exception 'Billing: Preço, status e recursos são definidos no servidor.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('saas:'||c,0));
 select * into cmd from private.saas_billing_commands where id=p_operation_id;
 if found then if cmd.company_id<>c or cmd.actor<>auth.uid() or cmd.action<>p_action or cmd.payload<>p_payload then raise exception 'Billing: Chave de operação reutilizada.' using errcode='22023';end if;return jsonb_build_object('command_id',cmd.id,'revision',cmd.expected_revision+1);end if;
 select * into s from public.saas_subscriptions where company_id=c for update;
 if coalesce(s.revision,0) is distinct from (p_payload->>'revision')::integer then raise exception 'Billing: Assinatura alterada. Atualize.' using errcode='40001';end if;
 if p_action='start_trial' and s.id is not null then raise exception 'Billing: Trial já utilizado por esta empresa.' using errcode='22023';end if;
 if p_action<>'start_trial' and s.id is null then raise exception 'Billing: Inicie a assinatura QA.' using errcode='22023';end if;
 if p_action='activate' and private.saas_state(c)->>'status'<>'trial'
 or p_action='renew' and (private.saas_state(c)->>'status' not in ('active','past_due','grace') or s.cancel_at_period_end)
 or p_action in ('payment_failed','grace') and private.saas_state(c)->>'status' not in ('active','past_due','grace')
 or p_action='cancel' and private.saas_state(c)->>'status' in ('expired','cancelled')
 or p_action='reactivate' and not s.cancel_at_period_end and private.saas_state(c)->>'status' not in ('expired','cancelled')
 then raise exception 'Billing: Transição indisponível para o estado atual.' using errcode='22023';end if;
 if p_action in ('start_trial','change_plan') then
 select * into p from public.saas_plans where id=(p_payload->>'plan_id')::uuid and active for share;
 if not found then raise exception 'Billing: Plano indisponível.' using errcode='22023';end if;
 if p.revision is distinct from (p_payload->>'plan_revision')::integer then raise exception 'Billing: Preço ou condições do plano alterados. Atualize antes de confirmar.' using errcode='40001';end if;
 if p_payload->>'cycle' not in ('monthly','yearly') or p_payload->>'cycle' is null then raise exception 'Billing: Selecione o ciclo.' using errcode='22023';end if;
 if p_action='change_plan' and private.saas_state(c)->>'status' in ('cancelled','expired') then raise exception 'Billing: Reative antes de alterar o plano.' using errcode='22023';end if;
 prepared:=jsonb_build_object('plan',to_jsonb(p),'cycle',p_payload->>'cycle');
 else prepared:=jsonb_build_object('plan',s.contract,'cycle',s.billing_cycle);end if;
 insert into private.saas_billing_commands(id,company_id,actor,action,payload,expected_revision,prepared) values(p_operation_id,c,auth.uid(),p_action,p_payload,coalesce(s.revision,0),prepared);
 return jsonb_build_object('command_id',p_operation_id,'revision',coalesce(s.revision,0)+1);
end $$;
revoke all on function public.saas_billing_prepare(text,jsonb,uuid) from public,anon;
grant execute on function public.saas_billing_prepare(text,jsonb,uuid) to authenticated;
create function public.saas_billing_secret() returns text language sql security definer set search_path='' as $$select secret from private.saas_billing_config where id$$;
revoke all on function public.saas_billing_secret() from public,anon,authenticated;
grant execute on function public.saas_billing_secret() to service_role;

create function public.saas_billing_event(p_event jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cmd private.saas_billing_commands%rowtype;s public.saas_subscriptions%rowtype;old jsonb;ev text;at timestamptz:=clock_timestamp();p jsonb;cycle text;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Billing denied' using errcode='42501';end if;
 select * into cmd from private.saas_billing_commands where id=(p_event->>'command_id')::uuid;
 if not found then raise exception 'Billing: Operação indisponível.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('saas:'||cmd.company_id,0));
 select * into cmd from private.saas_billing_commands where id=cmd.id for update;
 if p_event->>'event_id' is distinct from ('mock-billing:'||cmd.id) or (p_event->>'sequence')::integer is distinct from cmd.expected_revision+1 or p_event->>'state' is distinct from 'confirmed_qa' then raise exception 'Billing: Evento inválido.' using errcode='22023';end if;
 if cmd.applied then return jsonb_build_object('result','duplicate','subscription',cmd.result);end if;
 if not private.saas_manage(cmd.company_id,cmd.actor) or not exists(select 1 from private.saas_billing_qa_tenants where company_id=cmd.company_id) then raise exception 'Billing denied' using errcode='42501';end if;
 select * into s from public.saas_subscriptions where company_id=cmd.company_id for update;
 if coalesce(s.revision,0)<>cmd.expected_revision then return jsonb_build_object('result','stale');end if;
 old:=coalesce(to_jsonb(s),'{}');p:=cmd.prepared->'plan';cycle:=cmd.prepared->>'cycle';
 if cmd.action='start_trial' then
 insert into public.saas_subscriptions(company_id,plan_id,status,billing_cycle,trial_ends_at,current_period_start,current_period_end,provider_subscription_id,contract)
 values(cmd.company_id,(p->>'id')::uuid,'trial',cycle,at+make_interval(days=>(p->>'trial_days')::integer),at,at+make_interval(days=>(p->>'trial_days')::integer),'mock-billing-'||cmd.id,p) returning * into s;ev:='subscription.trial_started';
 else
 if cmd.action='change_plan' then s.plan_id:=(p->>'id')::uuid;s.contract:=p;s.billing_cycle:=cycle;ev:='subscription.plan_changed';
 elsif cmd.action='cancel' then s.cancel_at_period_end:=true;ev:='subscription.cancel_requested';
 elsif cmd.action='payment_failed' then s.status:='past_due';s.grace_ends_at:=at+make_interval(days=>(select grace_days from private.saas_billing_config where id));ev:='subscription.payment_failed';
 elsif cmd.action='grace' then s.status:='grace';s.grace_ends_at:=at+make_interval(days=>(select grace_days from private.saas_billing_config where id));ev:='subscription.grace_started';
 elsif cmd.action='expire' then s.status:=case when s.cancel_at_period_end then 'cancelled' else 'expired' end;s.cancelled_at:=case when s.cancel_at_period_end then at else null end;ev:='subscription.'||s.status;
 elsif cmd.action in ('activate','renew','reactivate') then
 if cmd.action='reactivate' and s.cancel_at_period_end and private.saas_state(cmd.company_id)->>'status' not in ('expired','cancelled') then s.cancel_at_period_end:=false;
 else s.current_period_start:=case when cmd.action='renew' then s.current_period_end else at end;
 if cmd.action<>'renew' or s.billing_anchor is null then s.billing_anchor:=extract(day from s.current_period_start at time zone 'UTC')::integer;end if;
 s.current_period_end:=private.saas_period_end(s.current_period_start,s.billing_cycle,s.billing_anchor);s.status:='active';s.cancel_at_period_end:=false;s.cancelled_at:=null;s.grace_ends_at:=null;end if;
 ev:=case cmd.action when 'renew' then 'subscription.renewed' when 'reactivate' then 'subscription.reactivated' else 'subscription.activated' end;
 end if;
 update public.saas_subscriptions set plan_id=s.plan_id,contract=s.contract,billing_cycle=s.billing_cycle,billing_anchor=s.billing_anchor,status=s.status,current_period_start=s.current_period_start,current_period_end=s.current_period_end,grace_ends_at=s.grace_ends_at,cancel_at_period_end=s.cancel_at_period_end,cancelled_at=s.cancelled_at,revision=revision+1,updated_at=at where id=s.id returning * into s;
 end if;
 insert into public.saas_subscription_events(company_id,subscription_id,event_id,action,revision,actor,before_state,after_state) values(cmd.company_id,s.id,p_event->>'event_id',ev,s.revision,cmd.actor,old,to_jsonb(s));
 perform private.saas_audit(cmd.company_id,ev,s.id::text,cmd.actor,jsonb_build_object('plan_id',s.plan_id,'status',s.status,'cycle',s.billing_cycle,'revision',s.revision,'qa',true));
 update private.saas_billing_commands set applied=true,result=to_jsonb(s) where id=cmd.id;
 return jsonb_build_object('result','applied','subscription',to_jsonb(s));
end $$;
revoke all on function public.saas_billing_event(jsonb) from public,anon,authenticated;
grant execute on function public.saas_billing_event(jsonb) to service_role;

create function public.saas_billing_source() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c text:=private.current_company_id();begin
 if not private.saas_manage(c) then raise exception 'Billing denied' using errcode='42501';end if;
 return jsonb_build_object('access',private.saas_state(c)||jsonb_build_object('qa_enabled',exists(select 1 from private.saas_billing_qa_tenants where company_id=c),'real_billing_enabled',false),
 'subscription',(select to_jsonb(s) from public.saas_subscriptions s where company_id=c),
 'plans',coalesce((select jsonb_agg(to_jsonb(p) order by sort_order,name) from public.saas_plans p where active),'[]'),
 'usage',jsonb_build_object('users',(select count(*) from public.profiles where company_id=c and active),'products',(select count(*) from public.products where company_id=c)),
 'grace_days',(select grace_days from private.saas_billing_config where id),
 'events',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from(select id,action,revision,before_state->'contract'->>'name' as previous_plan,after_state->'contract'->>'name' as next_plan,after_state->>'status' as status,created_at from public.saas_subscription_events where company_id=c order by created_at desc limit 200) x),'[]'));
end $$;
revoke all on function public.saas_billing_source() from public,anon;
grant execute on function public.saas_billing_source() to authenticated;
alter table public.saas_plans enable row level security;
alter table public.saas_subscriptions enable row level security;
alter table public.saas_subscription_events enable row level security;
revoke all on public.saas_plans,public.saas_subscriptions,public.saas_subscription_events from public,anon,authenticated;
grant select on public.saas_plans,public.saas_subscriptions,public.saas_subscription_events to authenticated;
create policy saas_plan_read on public.saas_plans for select to authenticated using(active);
create policy saas_subscription_read on public.saas_subscriptions for select to authenticated using(company_id=(select private.current_company_id()) and (select private.saas_manage(private.current_company_id())));
create policy saas_event_read on public.saas_subscription_events for select to authenticated using(company_id=(select private.current_company_id()) and (select private.saas_manage(private.current_company_id())));
grant execute on function private.saas_manage(text,uuid) to authenticated;

create function private.saas_assert_read(c text,feature text) returns void language plpgsql stable security definer set search_path='' as $$
declare m jsonb;begin
 if c is null then raise exception 'Billing denied' using errcode='42501';end if;
 m:=private.saas_state(c);
 -- Historical access/export remains available after expiration. Existing role checks still run.
 if not (m->>'read_only')::boolean and not coalesce((m#>>array['features',feature])::boolean,false) then raise exception 'Billing: Recurso indisponível no plano. Consulte Plano e Assinatura.' using errcode='42501';end if;
end $$;
revoke all on function private.saas_assert_read(text,text) from public,anon,authenticated;

-- Wrap existing reporting/read RPCs without changing their signatures or role authorization.
do $migration$declare f record;feature text;args text;oldname text;body text;begin
 for f in select p.oid,p.proname,pg_get_function_arguments(p.oid) as definition_args,pg_get_function_identity_arguments(p.oid) as identity_args,p.proargnames
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('finance_source','reports_source','reports_receivable_source','commission_source','payment_links_source','fiscal_source','product_reviews_source','catalog_source') loop
 feature:=case f.proname when 'finance_source' then 'finance' when 'commission_source' then 'commissions' when 'payment_links_source' then 'payment_links' when 'fiscal_source' then 'fiscal' when 'catalog_source' then 'catalog' when 'product_reviews_source' then 'catalog' else 'reports' end;
 oldname:='saas_original_'||f.proname;
 execute format('alter function public.%I(%s) rename to %I',f.proname,f.identity_args,oldname);
 execute format('alter function public.%I(%s) set schema private',oldname,f.identity_args);
 execute format('revoke all on function private.%I(%s) from public,anon,authenticated',oldname,f.identity_args);
 args:=coalesce(array_to_string(f.proargnames,','),'');
 body:=format('begin perform private.saas_assert_read(private.current_company_id(),%L); return private.%I(%s);end;',feature,oldname,args);
 execute format('create function public.%I(%s) returns jsonb language plpgsql security definer set search_path='''' as %L',f.proname,f.definition_args,body);
 execute format('revoke all on function public.%I(%s) from public,anon',f.proname,f.identity_args);
 execute format('grant execute on function public.%I(%s) to authenticated',f.proname,f.identity_args);
 end loop;
end $migration$;

-- Database enforcement also covers direct REST writes and SECURITY DEFINER mutation RPCs.
create function private.saas_write_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare rowdata jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 c text;prev text;feature text;limit_value integer;used bigint;active_new boolean;active_old boolean;begin
 if tg_table_name='companies' then c:=rowdata->>'id';else c:=rowdata->>'company_id';end if;
 if c is null and tg_table_name in ('order_items','quote_items') then
 if tg_table_name='order_items' then select company_id into c from public.orders where id=rowdata->>'order_id';else select company_id into c from public.quotes where id=rowdata->>'quote_id';end if;
 end if;
 if tg_table_name='cash_register_transactions' then
 select company_id into c from public.cash_register_sessions where id=rowdata->>'session_id';
 if tg_op='UPDATE' then select company_id into prev from public.cash_register_sessions where id=to_jsonb(old)->>'session_id';
 if prev is distinct from c then raise exception 'Billing: Não é permitido transferir lançamentos entre empresas.' using errcode='42501';end if;end if;
 end if;
 if c is null then if tg_op='DELETE' then return old;else return new;end if;end if;
 if tg_op='UPDATE' then prev:=case when tg_table_name='companies' then to_jsonb(old)->>'id' else to_jsonb(old)->>'company_id' end;
 if prev is not null and prev<>c then
 perform private.saas_assert_write(prev,null);
 end if;end if;
 -- Unmanaged tenants keep their current behavior. No enrollment or defaults are forced.
 if not exists(select 1 from public.saas_subscriptions where company_id=c) then if tg_op='DELETE' then return old;else return new;end if;end if;
 if not pg_try_advisory_xact_lock(hashtextextended('saas:'||c,0)) then raise exception 'Billing: Operação concorrente. Atualize e tente novamente.' using errcode='40001';end if;
 feature:=case
 when tg_table_name like 'fiscal_%' then 'fiscal'
 when tg_table_name like 'commission_%' then 'commissions'
 when tg_table_name like 'payment_link%' then 'payment_links'
 when tg_table_name like 'financial_%' or tg_table_name like 'cash_register_%' or tg_table_name='finance_settings' then 'finance'
 when tg_table_name like 'catalog_%' or tg_table_name in ('product_reviews','company_footer_badges','company_footer_badge_defaults') then 'catalog'
 else null end;
 perform private.saas_assert_write(c,feature);
 if tg_table_name='products' then
 if (tg_op='INSERT' and coalesce((rowdata->>'catalog_active')::boolean,false)) or (tg_op='UPDATE' and new.catalog_active and new.catalog_active is distinct from old.catalog_active) then perform private.saas_assert_write(c,'catalog');end if;
 if tg_op<>'DELETE' and (tg_op='INSERT' and (nullif(rowdata->>'image_url','') is not null or coalesce(rowdata#>'{pricing_details,gallery_images}','[]')<>'[]'::jsonb or nullif(rowdata#>>'{pricing_details,video_url}','') is not null) or tg_op='UPDATE' and (nullif(to_jsonb(new)->>'image_url','') is distinct from nullif(to_jsonb(old)->>'image_url','') or coalesce(nullif(to_jsonb(new)#>'{pricing_details,gallery_images}','null'::jsonb),'[]'::jsonb) is distinct from coalesce(nullif(to_jsonb(old)#>'{pricing_details,gallery_images}','null'::jsonb),'[]'::jsonb) or nullif(to_jsonb(new)#>>'{pricing_details,video_url}','') is distinct from nullif(to_jsonb(old)#>>'{pricing_details,video_url}',''))) then perform private.saas_assert_write(c,'advanced_media');end if;
 end if;
 if tg_table_name='products' and tg_op='INSERT' then
 limit_value:=(private.saas_state(c)#>>'{limits,products}')::integer;
 select count(*) into used from public.products where company_id=c;
 elsif tg_table_name='profiles' and tg_op<>'DELETE' then
 active_new:=coalesce((rowdata->>'active')::boolean,false);active_old:=case when tg_op='UPDATE' then coalesce(old.active,false) else false end;
 if active_new and not active_old then limit_value:=(private.saas_state(c)#>>'{limits,users}')::integer;select count(*) into used from public.profiles where company_id=c and active;end if;
 end if;
 if limit_value is not null and used>=limit_value then raise exception 'Billing: Limite de % % do plano atingido. Consulte Plano e Assinatura.',limit_value,case when tg_table_name='profiles' then 'usuários ativos' else 'produtos' end using errcode='42501';end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function private.saas_write_guard() from public,anon,authenticated;
do $$declare t record;begin
 for t in select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'
 and table_name not like 'saas_%' and table_name not in ('audit_logs','catalog_events','privacy_audit_events','cookie_preferences','customer_consents','data_subject_requests')
 and (table_name in ('companies','order_items','quote_items','cash_register_transactions') or exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=information_schema.tables.table_name and c.column_name='company_id')) loop
 execute format('create trigger saas_billing_write_guard before insert or update or delete on public.%I for each row execute function private.saas_write_guard()',t.table_name);
 end loop;
end $$;

create function private.saas_history_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Billing history is immutable';end $$;
revoke all on function private.saas_history_immutable() from public,anon,authenticated;
create trigger saas_history_immutable before update or delete on public.saas_subscription_events for each row execute function private.saas_history_immutable();

-- Private inventories and public checkout are also protected at their canonical RPC boundary.
do $migration$declare f record;feature text;company_expr text;args text;oldname text;body text;begin
 for f in select p.oid,p.proname,pg_get_function_arguments(p.oid) definition_args,pg_get_function_identity_arguments(p.oid) identity_args,pg_get_function_result(p.oid) result_type,p.proargnames
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('catalog_checkout','product_reviews_command','product_review_token','product_media_register') loop
 oldname:='saas_original_'||f.proname;
 execute format('alter function public.%I(%s) rename to %I',f.proname,f.identity_args,oldname);
 execute format('alter function public.%I(%s) set schema private',oldname,f.identity_args);
 execute format('revoke all on function private.%I(%s) from public,anon,authenticated,service_role',oldname,f.identity_args);
 args:=array_to_string(f.proargnames,',');
 company_expr:=case when f.proname='product_reviews_command' then 'private.current_company_id()' else 'p_company' end;
 feature:=case when f.proname='product_media_register' then 'case split_part(p_path,''/'',2) when ''products'' then ''advanced_media'' when ''catalog'' then ''catalog'' else null end' else quote_literal('catalog') end;
 body:=format('begin %s perform private.saas_assert_write(%s,%s); %s private.%I(%s); %s end;',
 case when f.proname='product_review_token' then 'if p_review is null then return private.'||quote_ident(oldname)||'('||args||');end if;' else '' end,
 company_expr,feature,case when f.result_type='void' then 'perform' else 'return' end,oldname,args,case when f.result_type='void' then 'return;' else '' end);
 execute format('create function public.%I(%s) returns %s language plpgsql security definer set search_path='''' as %L',f.proname,f.definition_args,f.result_type,body);
 execute format('revoke all on function public.%I(%s) from public,anon,authenticated',f.proname,f.identity_args);
 execute format('grant execute on function public.%I(%s) to %I',f.proname,f.identity_args,case when f.proname='product_reviews_command' then 'authenticated' else 'service_role' end);
 end loop;
end $migration$;

-- Global catalog changes have a separate immutable service audit, never a tenant ledger.
create table private.saas_plan_audit(id bigint generated always as identity primary key,plan_id uuid not null,operation text not null,before_state jsonb,after_state jsonb,created_at timestamptz not null default now());
alter table private.saas_plan_audit enable row level security;
revoke all on private.saas_plan_audit from public,anon,authenticated;
create function private.saas_plan_audit_trigger() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into private.saas_plan_audit(plan_id,operation,before_state,after_state) values(new.id,tg_op,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;
end $$;
revoke all on function private.saas_plan_audit_trigger() from public,anon,authenticated;
create trigger saas_plan_audit after insert or update on public.saas_plans for each row execute function private.saas_plan_audit_trigger();
create trigger saas_plan_audit_immutable before update or delete on private.saas_plan_audit for each row execute function private.saas_history_immutable();

-- Direct REST writes retain user permissions. Definer RPCs retain their own
-- operation-specific authority (e.g. order receipt and POS may write ledger rows).
create function private.saas_rest_permission(module text) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.saas_subscriptions where company_id=private.current_company_id()) or exists(
 select 1 from public.profiles p left join public.role_permissions r on r.company_id=p.company_id and r.path=module
 where p.company_id=private.current_company_id() and p.auth_user_id=auth.uid() and p.active
 and p.role=any(coalesce(r.roles,case when module='/settings' then array['admin','gerente']::text[] when module='/financial' then array['admin','gerente','financeiro']::text[] when module='/pos' then array['admin','gerente','financeiro','vendas']::text[] when module='/quotes' then array['admin','gerente','financeiro','vendas']::text[] else array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']::text[] end)))
$$;
revoke all on function private.saas_rest_permission(text) from public,anon;
grant execute on function private.saas_rest_permission(text) to authenticated;
do $migration$declare t record;module text;operation text;begin
 for t in select tablename from pg_tables where schemaname='public' loop
 module:=case when t.tablename like 'cash_register_%' then '/pos'
 when t.tablename like 'financial_%' or t.tablename like 'fiscal_%' or t.tablename like 'commission_%' or t.tablename like 'payment_link%' or t.tablename='finance_settings' then '/financial'
 when t.tablename like 'catalog_%' or t.tablename in ('settings','companies','profiles','role_permissions','pickup_points','product_reviews','company_footer_badges','company_footer_badge_defaults') then '/settings'
 when t.tablename='products' then '/products' when t.tablename in ('orders','order_items') then '/orders' when t.tablename in ('quotes','quote_items') then '/quotes' else null end;
 if module is not null then
 foreach operation in array array['insert','update','delete'] loop
 execute format('create policy saas_rest_%s on public.%I as restrictive for %s to authenticated %s',operation,t.tablename,operation,
 case when operation='insert' then format('with check ((select private.saas_rest_permission(%L)))',module)
 when operation='delete' then format('using ((select private.saas_rest_permission(%L)))',module)
 else format('using ((select private.saas_rest_permission(%L))) with check ((select private.saas_rest_permission(%L)))',module,module) end);
 end loop;end if;
 end loop;
end $migration$;

