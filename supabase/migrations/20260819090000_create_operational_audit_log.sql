-- Phase 4A: deterministic production stages and tenant-scoped audit foundation.
-- Existing production rows are preserved; no historical events are fabricated.

-- The legacy CHECK only admits five of the eight production stages already used by
-- the application. Replace only that data-preserving constraint; no table or row is
-- dropped and no status is rewritten.
alter table public.production_queue
  drop constraint if exists production_queue_status_check;

alter table public.production_queue
  add constraint production_queue_status_check
  check (status in (
    'fila', 'producao', 'impressao', 'acabamento', 'concluido',
    'expedicao', 'entregue', 'finalizado'
  ));

create unique index if not exists production_queue_company_order_item_unique
  on public.production_queue(company_id, order_item_id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  actor_user_id uuid not null,
  actor_profile_id text,
  actor_name text not null,
  actor_role text not null,
  action text not null check (action = btrim(action) and char_length(action) between 1 and 120),
  entity_type text not null check (entity_type = btrim(entity_type) and char_length(entity_type) between 1 and 80),
  entity_id text not null check (entity_id = btrim(entity_id) and char_length(entity_id) between 1 and 200),
  module text not null check (module = btrim(module) and char_length(module) between 1 and 80),
  old_values jsonb not null default '{}'::jsonb check (jsonb_typeof(old_values) = 'object'),
  new_values jsonb not null default '{}'::jsonb check (jsonb_typeof(new_values) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index audit_logs_company_created_idx
  on public.audit_logs(company_id, created_at desc, id desc);

create index audit_logs_company_filters_idx
  on public.audit_logs(company_id, module, action, actor_user_id, created_at desc);

alter table public.audit_logs enable row level security;

revoke all on table public.audit_logs from public, anon, authenticated;
grant select on table public.audit_logs to authenticated;

create policy audit_logs_admin_tenant_select
on public.audit_logs for select to authenticated
using (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) = 'admin'
);

create or replace function private.current_user_can_access_operational_path(
  p_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with current_profile as (
    select p.company_id, p.role
    from public.profiles p
    where p.auth_user_id = (select auth.uid())
      and p.active = true
    order by p.id
    limit 1
  )
  select coalesce((
    select case
      when p_path is distinct from '/production' then false
      when cp.role = 'admin' then true
      when cp.role in ('gerente', 'producao', 'arte_finalista') then coalesce((
        select cp.role = any(rp.roles)
        from public.role_permissions rp
        where rp.company_id = cp.company_id
          and rp.path = p_path
      ), true)
      else false
    end
    from current_profile cp
  ), false)
$$;

revoke all on function private.current_user_can_access_operational_path(text)
from public, anon;
grant execute on function private.current_user_can_access_operational_path(text)
to authenticated;

create or replace function public.transition_production_stage(
  p_item_id text,
  p_next_status text,
  p_expected_updated_at timestamptz
)
returns table (
  result_status text,
  item_id text,
  item_company_id text,
  item_order_id text,
  item_order_number text,
  item_order_item_id text,
  item_product_name text,
  item_quantity numeric,
  item_status text,
  item_priority text,
  item_deadline timestamptz,
  item_responsible_name text,
  item_started_at timestamptz,
  item_finished_at timestamptz,
  item_created_at timestamptz,
  item_updated_at timestamptz,
  audit_log_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_item public.production_queue%rowtype;
  v_old_status text;
  v_audit_id uuid;
begin
  if (select auth.uid()) is null
    or not private.current_user_can_access_operational_path('/production') then
    return query select
      'NOT_AUTHORIZED'::text,
      null::text, null::text, null::text, null::text, null::text,
      null::text, null::numeric, null::text, null::text, null::timestamptz,
      null::text, null::timestamptz, null::timestamptz, null::timestamptz,
      null::timestamptz, null::uuid;
    return;
  end if;

  if p_next_status is null or p_next_status not in (
    'fila', 'producao', 'impressao', 'acabamento', 'concluido',
    'expedicao', 'entregue', 'finalizado'
  ) then
    return query select
      'INVALID_STATUS'::text,
      null::text, null::text, null::text, null::text, null::text,
      null::text, null::numeric, null::text, null::text, null::timestamptz,
      null::text, null::timestamptz, null::timestamptz, null::timestamptz,
      null::timestamptz, null::uuid;
    return;
  end if;

  select p.*
  into v_actor
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
    and p.active = true
  order by p.id
  limit 1;

  if not found then
    return query select
      'NOT_AUTHORIZED'::text,
      null::text, null::text, null::text, null::text, null::text,
      null::text, null::numeric, null::text, null::text, null::timestamptz,
      null::text, null::timestamptz, null::timestamptz, null::timestamptz,
      null::timestamptz, null::uuid;
    return;
  end if;

  select q.*
  into v_item
  from public.production_queue q
  where q.id = p_item_id
    and q.company_id = v_actor.company_id
  for update;

  if not found then
    return query select
      'NOT_FOUND'::text,
      null::text, null::text, null::text, null::text, null::text,
      null::text, null::numeric, null::text, null::text, null::timestamptz,
      null::text, null::timestamptz, null::timestamptz, null::timestamptz,
      null::timestamptz, null::uuid;
    return;
  end if;

  if v_item.updated_at is distinct from p_expected_updated_at then
    return query select
      'CONFLICT'::text,
      v_item.id, v_item.company_id, v_item.order_id, v_item.order_number,
      v_item.order_item_id, v_item.product_name, v_item.quantity, v_item.status,
      v_item.priority, v_item.deadline, v_item.responsible_name,
      v_item.started_at, v_item.finished_at, v_item.created_at, v_item.updated_at,
      null::uuid;
    return;
  end if;

  if v_item.status = p_next_status then
    return query select
      'UNCHANGED'::text,
      v_item.id, v_item.company_id, v_item.order_id, v_item.order_number,
      v_item.order_item_id, v_item.product_name, v_item.quantity, v_item.status,
      v_item.priority, v_item.deadline, v_item.responsible_name,
      v_item.started_at, v_item.finished_at, v_item.created_at, v_item.updated_at,
      null::uuid;
    return;
  end if;

  v_old_status := v_item.status;

  update public.production_queue q
  set
    status = p_next_status,
    started_at = case
      when p_next_status <> 'fila' then coalesce(q.started_at, clock_timestamp())
      else q.started_at
    end,
    finished_at = case
      when p_next_status in ('concluido', 'finalizado') then coalesce(q.finished_at, clock_timestamp())
      else null
    end
  where q.id = v_item.id
    and q.company_id = v_actor.company_id
  returning q.* into v_item;

  insert into public.audit_logs (
    company_id,
    actor_user_id,
    actor_profile_id,
    actor_name,
    actor_role,
    action,
    entity_type,
    entity_id,
    module,
    old_values,
    new_values,
    metadata
  ) values (
    v_actor.company_id,
    (select auth.uid()),
    v_actor.id,
    v_actor.name,
    v_actor.role,
    'production.stage_changed',
    'production_queue',
    v_item.id,
    'production',
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', v_item.status),
    jsonb_build_object(
      'order_id', v_item.order_id,
      'order_number', v_item.order_number,
      'order_item_id', v_item.order_item_id
    )
  )
  returning id into v_audit_id;

  return query select
    'UPDATED'::text,
    v_item.id, v_item.company_id, v_item.order_id, v_item.order_number,
    v_item.order_item_id, v_item.product_name, v_item.quantity, v_item.status,
    v_item.priority, v_item.deadline, v_item.responsible_name,
    v_item.started_at, v_item.finished_at, v_item.created_at, v_item.updated_at,
    v_audit_id;
end;
$$;

revoke all on function public.transition_production_stage(text, text, timestamptz)
from public, anon;
grant execute on function public.transition_production_stage(text, text, timestamptz)
to authenticated;

create or replace function public.ensure_production_queue_for_order(
  p_order_id text
)
returns setof public.production_queue
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id text;
begin
  select p.company_id
  into v_company_id
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
    and p.active = true
  order by p.id
  limit 1;

  if v_company_id is null
    or not private.current_user_can_access_operational_path('/production') then
    return;
  end if;

  return query
  insert into public.production_queue (
    company_id,
    order_id,
    order_number,
    order_item_id,
    product_name,
    quantity,
    status,
    priority,
    deadline
  )
  select
    o.company_id,
    o.id,
    o.number,
    i.id,
    i.product_name,
    i.quantity,
    case when o.status in ('impressao', 'acabamento') then 'impressao' else 'fila' end,
    'media',
    o.deadline
  from public.orders o
  join public.order_items i on i.order_id = o.id
  where o.id = p_order_id
    and o.company_id = v_company_id
  on conflict (company_id, order_item_id) do nothing
  returning *;
end;
$$;

revoke all on function public.ensure_production_queue_for_order(text)
from public, anon;
grant execute on function public.ensure_production_queue_for_order(text)
to authenticated;

-- The browser can read queue rows and update only responsibility. Stage creation and
-- transition are server-side RPC operations so an audit event cannot be bypassed.
revoke all on table public.production_queue from authenticated;
grant select on table public.production_queue to authenticated;
grant delete on table public.production_queue to authenticated;
grant update (responsible_name) on table public.production_queue to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.production_queue;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
