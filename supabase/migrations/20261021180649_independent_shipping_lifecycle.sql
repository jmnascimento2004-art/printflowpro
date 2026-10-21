-- Explicit independent lifecycles; no historical rows are rewritten.
alter table public.shipments drop constraint shipments_status_check;
alter table public.shipments add constraint shipments_status_check
  check (status in ('separacao','embalagem','enviado','em_rota','entregue'));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'shipments') then
    alter publication supabase_realtime add table public.shipments;
  end if;
end;
$$;

create or replace function public.transition_shipment(
  p_shipment_id text,
  p_status text,
  p_tracking_code text default null,
  p_carrier text default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id text := private.current_company_id();
  v_shipment public.shipments%rowtype;
begin
  if (select auth.uid()) is null or v_company_id is null
     or not private.current_user_can_access_path('/shipment') then
    return jsonb_build_object('status', 'NOT_AUTHORIZED');
  end if;
  if p_status is null or p_status not in ('separacao','embalagem','enviado','em_rota','entregue') then
    return jsonb_build_object('status', 'INVALID_INPUT');
  end if;

  select s.* into v_shipment
  from public.shipments s
  where s.id = p_shipment_id and s.company_id = v_company_id
  for update;
  if not found then return jsonb_build_object('status', 'NOT_FOUND'); end if;
  if v_shipment.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('status', 'CONFLICT', 'shipment', to_jsonb(v_shipment));
  end if;
  if v_shipment.status = p_status
     and coalesce(p_tracking_code, v_shipment.tracking_code) is not distinct from v_shipment.tracking_code
     and coalesce(p_carrier, v_shipment.carrier) is not distinct from v_shipment.carrier then
    return jsonb_build_object('status', 'UNCHANGED', 'shipment', to_jsonb(v_shipment));
  end if;

  if v_shipment.status <> p_status and not (
    (v_shipment.status = 'separacao' and p_status in ('embalagem','enviado')) or
    (v_shipment.status = 'embalagem' and p_status = 'enviado') or
    (v_shipment.status = 'enviado' and p_status = 'em_rota') or
    (v_shipment.status = 'em_rota' and p_status = 'entregue')
  ) then
    return jsonb_build_object('status', 'INVALID_INPUT', 'shipment', to_jsonb(v_shipment));
  end if;

  update public.shipments s set
    status = p_status,
    tracking_code = coalesce(nullif(btrim(p_tracking_code), ''), s.tracking_code),
    carrier = coalesce(nullif(btrim(p_carrier), ''), s.carrier),
    shipped_at = case when p_status = 'enviado' then coalesce(s.shipped_at, clock_timestamp()) else s.shipped_at end,
    delivered_at = case when p_status = 'entregue' then coalesce(s.delivered_at, clock_timestamp()) else s.delivered_at end
  where s.id = v_shipment.id
  returning s.* into v_shipment;


  return jsonb_build_object('status', 'UPDATED', 'shipment', to_jsonb(v_shipment));
end;
$$;

create or replace function public.transition_order_status_phase4b(
  p_order_id text,
  p_status text,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id text := private.current_company_id();
  v_actor public.profiles%rowtype;
  v_order public.orders%rowtype;
  v_old_status text;
  v_shipment public.shipments%rowtype;
  v_address jsonb := '{}'::jsonb;
begin
  if (select auth.uid()) is null or v_company_id is null
     or not private.current_user_can_access_path('/orders') then
    return jsonb_build_object('status', 'NOT_AUTHORIZED');
  end if;
  if p_status not in ('orcamento','aguardando_aprovacao','aguardando_pagamento','producao','impressao','acabamento','expedicao','entregue','finalizado','cancelado') then
    return jsonb_build_object('status', 'INVALID_INPUT');
  end if;
  select p.* into v_actor from public.profiles p
  where p.auth_user_id = (select auth.uid()) and p.active = true and p.company_id = v_company_id
  order by p.id limit 1;
  if not found then return jsonb_build_object('status', 'NOT_AUTHORIZED'); end if;

  select o.* into v_order from public.orders o
  where o.id = p_order_id and o.company_id = v_company_id for update;
  if not found then return jsonb_build_object('status', 'NOT_FOUND'); end if;
  if p_expected_updated_at is not null and v_order.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('status', 'CONFLICT', 'order', to_jsonb(v_order));
  end if;
  if v_order.status = p_status then
    select s.* into v_shipment from public.shipments s
    where s.company_id = v_company_id and s.order_id = v_order.id;
    return jsonb_build_object('status', 'UNCHANGED', 'order', to_jsonb(v_order), 'shipment', case when found then to_jsonb(v_shipment) else null end);
  end if;

  v_old_status := v_order.status;
  update public.orders o set status = p_status where o.id = v_order.id returning o.* into v_order;

  if p_status = 'expedicao' then
    select coalesce(to_jsonb(c.address), '{}'::jsonb) into v_address
    from public.customers c where c.id = v_order.customer_id and c.company_id = v_company_id;
    insert into public.shipments(company_id, order_id, order_number, customer_name, status, carrier, address)
    values (v_company_id, v_order.id, v_order.number, v_order.customer_name, 'separacao', 'Retirada Balcão', coalesce(v_address, '{}'::jsonb))
    on conflict (company_id, order_id) do nothing;
  end if;

  select s.* into v_shipment from public.shipments s
  where s.company_id = v_company_id and s.order_id = v_order.id;

  insert into public.audit_logs(company_id, actor_user_id, actor_profile_id, actor_name, actor_role,
    action, entity_type, entity_id, module, old_values, new_values, metadata)
  values (v_company_id, (select auth.uid()), v_actor.id, v_actor.name, v_actor.role,
    'order.status_changed', 'orders', v_order.id, 'orders',
    jsonb_build_object('status', v_old_status), jsonb_build_object('status', v_order.status),
    jsonb_build_object('order_number', v_order.number, 'source', 'phase4b_explicit_command'));

  return jsonb_build_object('status', 'UPDATED', 'order', to_jsonb(v_order), 'shipment', case when found then to_jsonb(v_shipment) else null end);
end;
$$;

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
    'fila', 'producao', 'impressao', 'concluido'
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

  -- Serialize readiness across all items; use the same order-before-queue lock order
  -- as order commands, so concurrent last-item completions cannot miss dispatch creation.
  perform 1 from public.orders o
  join public.production_queue q on q.order_id = o.id and q.company_id = o.company_id
  where q.id = p_item_id and o.company_id = v_actor.company_id
  for update of o;

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

  if p_next_status = 'concluido' and not exists (
    select 1 from public.production_queue q
    where q.company_id = v_actor.company_id and q.order_id = v_item.order_id
      and q.status not in ('concluido','expedicao','entregue','finalizado')
  ) then
    insert into public.shipments(company_id, order_id, order_number, customer_name, status, carrier, address)
    select o.company_id, o.id, o.number, o.customer_name, 'separacao', 'Retirada Balcão',
      coalesce(to_jsonb(c.address), '{}'::jsonb)
    from public.orders o
    left join public.customers c on c.id = o.customer_id and c.company_id = o.company_id
    where o.id = v_item.order_id and o.company_id = v_actor.company_id and o.status <> 'cancelado'
    on conflict (company_id, order_id) do nothing;
  end if;

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

revoke all on function public.transition_shipment(text,text,text,text,timestamptz) from public, anon;
grant execute on function public.transition_shipment(text,text,text,text,timestamptz) to authenticated;
-- Only the existing atomic order/production wrapper may invoke this internal function.
revoke all on function public.transition_order_status_phase4b(text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.transition_production_stage(text,text,timestamptz) from public, anon;
grant execute on function public.transition_production_stage(text,text,timestamptz) to authenticated;
