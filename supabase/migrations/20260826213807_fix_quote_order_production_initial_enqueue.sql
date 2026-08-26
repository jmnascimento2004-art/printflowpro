-- Make Quote -> Order -> Production one atomic domain operation while keeping
-- the persisted production stage independent after the initial enqueue.

create or replace function private.ensure_production_queue_for_order(
  p_order_id text,
  p_company_id text
)
returns setof public.production_queue
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Existing operational rows keep their manually persisted stage and
  -- ownership fields. Only denormalized order/item fields may be refreshed
  -- after an explicit save of an already operational order.
  update public.production_queue q
  set
    order_number = o.number,
    product_name = i.product_name,
    quantity = i.quantity,
    deadline = o.deadline
  from public.orders o
  join public.order_items i on i.order_id = o.id
  where q.company_id = p_company_id
    and q.order_id = p_order_id
    and q.company_id = o.company_id
    and q.order_item_id = i.id
    and o.id = p_order_id
    and o.company_id = p_company_id
    and o.status in ('producao', 'impressao', 'acabamento')
    and (q.order_number, q.product_name, q.quantity, q.deadline)
      is distinct from (o.number, i.product_name, i.quantity, o.deadline);

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
    and o.company_id = p_company_id
    and (
      o.status in ('producao', 'impressao', 'acabamento')
      or (
        o.status = 'aguardando_pagamento'
        and o.source_quote_id is not null
        and exists (
          select 1
          from public.quotes q
          where q.id = o.source_quote_id
            and q.company_id = o.company_id
            and q.status = 'aprovado'
        )
      )
    )
  on conflict (company_id, order_item_id) do nothing
  returning *;
end;
$$;

revoke all on function private.ensure_production_queue_for_order(text, text)
from public, anon, authenticated;

create or replace function public.approve_quote_and_create_order(p_quote_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id text := private.current_company_id();
  v_quote public.quotes%rowtype;
  v_order public.orders%rowtype;
  v_order_items jsonb := '[]'::jsonb;
  v_production jsonb := '[]'::jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null
    or v_company_id is null
    or not private.current_user_can_access_path('/quotes') then
    raise exception using errcode = '42501', message = 'QUOTE_APPROVAL_NOT_AUTHORIZED';
  end if;

  perform 1
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
    and p.company_id = v_company_id
    and p.active = true
  order by p.id
  limit 1;

  if not found then
    raise exception using errcode = '42501', message = 'QUOTE_APPROVAL_NOT_AUTHORIZED';
  end if;

  select q.*
  into v_quote
  from public.quotes q
  where q.id = p_quote_id
    and q.company_id = v_company_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'QUOTE_NOT_FOUND';
  end if;

  select o.*
  into v_order
  from public.orders o
  where o.company_id = v_company_id
    and o.source_quote_id = v_quote.id;

  if found then
    if v_quote.status is distinct from 'aprovado' then
      raise exception using errcode = '22023', message = 'QUOTE_ORDER_STATE_CONFLICT';
    end if;
  else
    if v_quote.status is null
      or v_quote.status not in ('rascunho', 'pendente', 'aprovado') then
      raise exception using errcode = '22023', message = 'QUOTE_STATUS_NOT_APPROVABLE';
    end if;

    if v_quote.customer_id is null then
      raise exception using errcode = '22023', message = 'QUOTE_CUSTOMER_REQUIRED';
    end if;

    if not exists (
      select 1
      from public.quote_items qi
      where qi.quote_id = v_quote.id
    ) then
      raise exception using errcode = '22023', message = 'QUOTE_ITEMS_REQUIRED';
    end if;

    if not exists (
      select 1
      from public.customers c
      where c.id = v_quote.customer_id
        and c.company_id = v_company_id
    ) then
      raise exception using errcode = '22023', message = 'QUOTE_CUSTOMER_TENANT_MISMATCH';
    end if;

    if exists (
      select 1
      from public.quote_items qi
      join public.products p on p.id = qi.product_id
      where qi.quote_id = v_quote.id
        and qi.product_id is not null
        and p.company_id <> v_company_id
    ) then
      raise exception using errcode = '22023', message = 'QUOTE_PRODUCT_TENANT_MISMATCH';
    end if;

    insert into public.orders (
      company_id,
      customer_id,
      customer_name,
      number,
      status,
      total_amount,
      paid_amount,
      payment_status,
      shipping_cost,
      deadline,
      notes,
      delivery_type,
      delivery_origin_address,
      delivery_address,
      delivery_distance_km,
      additional_services,
      source_quote_id,
      created_at,
      updated_at
    ) values (
      v_company_id,
      v_quote.customer_id,
      v_quote.customer_name,
      private.next_order_number(v_company_id),
      'aguardando_pagamento',
      v_quote.total_amount,
      0,
      'pendente',
      coalesce(v_quote.delivery_fee, 0),
      v_now + interval '5 days',
      'Convertido do Orcamento #' || v_quote.number ||
        case
          when nullif(btrim(v_quote.notes), '') is null then '.'
          else '. ' || btrim(v_quote.notes)
        end,
      v_quote.delivery_type,
      v_quote.delivery_origin_address,
      v_quote.delivery_address,
      coalesce(v_quote.delivery_distance_km, 0),
      coalesce(v_quote.additional_services, '[]'::jsonb),
      v_quote.id,
      v_now,
      v_now
    )
    returning * into v_order;

    insert into public.order_items (
      id,
      order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      total_price,
      details,
      outsourced,
      outsourced_cost,
      created_at
    )
    select
      gen_random_uuid()::text,
      v_order.id,
      qi.product_id,
      qi.product_name,
      qi.quantity,
      qi.unit_price,
      qi.total_price,
      qi.details,
      false,
      0,
      v_now
    from public.quote_items qi
    where qi.quote_id = v_quote.id;
  end if;

  if v_quote.status <> 'aprovado' then
    update public.quotes q
    set status = 'aprovado',
        updated_at = v_now
    where q.id = v_quote.id
      and q.company_id = v_company_id
    returning * into v_quote;
  end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at, q.id), '[]'::jsonb)
  into v_production
  from private.ensure_production_queue_for_order(v_order.id, v_company_id) q;

  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.created_at, oi.id), '[]'::jsonb)
  into v_order_items
  from public.order_items oi
  where oi.order_id = v_order.id;

  return jsonb_build_object(
    'quote', to_jsonb(v_quote),
    'order', to_jsonb(v_order),
    'items', v_order_items,
    'production', v_production
  );
end;
$$;

revoke all on function public.approve_quote_and_create_order(text)
from public, anon;
grant execute on function public.approve_quote_and_create_order(text)
to authenticated;

-- Repair only the confirmed PED-0025 gap. Environments without this production
-- record are a no-op; ambiguous or partial states fail closed.
do $$
declare
  v_company_id text;
  v_order_id text;
  v_candidate_count integer;
  v_item_count integer;
  v_existing_count integer;
  v_inserted_count integer;
  v_final_count integer;
  v_sets_match boolean;
begin
  select count(*), min(o.company_id), min(o.id)
  into v_candidate_count, v_company_id, v_order_id
  from public.orders o
  join public.companies c on c.id = o.company_id
  join public.quotes q
    on q.id = o.source_quote_id
   and q.company_id = o.company_id
  where regexp_replace(coalesce(c.document, ''), '\D', '', 'g') = '30807938000189'
    and upper(btrim(o.number)) = 'PED-0025'
    and q.number = 1026
    and q.status = 'aprovado'
    and o.status = 'aguardando_pagamento';

  if v_candidate_count = 0 then
    return;
  end if;
  if v_candidate_count <> 1 then
    raise exception using errcode = 'P0001', message = 'PED_0025_TARGET_AMBIGUOUS';
  end if;

  select count(*) into v_item_count
  from public.order_items i
  where i.order_id = v_order_id;

  if v_item_count = 0 then
    raise exception using errcode = 'P0001', message = 'PED_0025_ITEMS_MISSING';
  end if;

  select count(*) into v_existing_count
  from public.production_queue q
  where q.company_id = v_company_id
    and q.order_id = v_order_id;

  select
    not exists (
      select 1
      from public.order_items i
      where i.order_id = v_order_id
        and not exists (
          select 1
          from public.production_queue pq
          where pq.company_id = v_company_id
            and pq.order_id = v_order_id
            and pq.order_item_id = i.id
        )
    )
    and not exists (
      select 1
      from public.production_queue pq
      where pq.company_id = v_company_id
        and pq.order_id = v_order_id
        and not exists (
          select 1
          from public.order_items i
          where i.order_id = v_order_id
            and i.id = pq.order_item_id
        )
    )
  into v_sets_match;

  if v_existing_count = v_item_count and v_sets_match then
    return;
  end if;
  if v_existing_count <> 0 then
    raise exception using errcode = 'P0001', message = 'PED_0025_PRODUCTION_PARTIAL_STATE';
  end if;

  select count(*) into v_inserted_count
  from private.ensure_production_queue_for_order(v_order_id, v_company_id);

  if v_inserted_count <> v_item_count then
    raise exception using errcode = 'P0001', message = 'PED_0025_PRODUCTION_INSERT_COUNT_MISMATCH';
  end if;

  select count(*) into v_final_count
  from public.production_queue q
  where q.company_id = v_company_id
    and q.order_id = v_order_id
    and q.status = 'fila';

  select
    not exists (
      select 1
      from public.order_items i
      where i.order_id = v_order_id
        and not exists (
          select 1
          from public.production_queue pq
          where pq.company_id = v_company_id
            and pq.order_id = v_order_id
            and pq.order_item_id = i.id
        )
    )
    and not exists (
      select 1
      from public.production_queue pq
      where pq.company_id = v_company_id
        and pq.order_id = v_order_id
        and not exists (
          select 1
          from public.order_items i
          where i.order_id = v_order_id
            and i.id = pq.order_item_id
        )
    )
  into v_sets_match;

  if v_final_count <> v_item_count or not v_sets_match then
    raise exception using errcode = 'P0001', message = 'PED_0025_PRODUCTION_REPAIR_FAILED';
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
    v_company_id,
    null,
    null,
    'SYSTEM',
    'system',
    'production.queue_repaired',
    'orders',
    v_order_id,
    'production',
    '{}'::jsonb,
    jsonb_build_object('queue_item_count', v_inserted_count),
    jsonb_build_object(
      'order_number', 'PED-0025',
      'quote_number', 1026,
      'source', 'targeted_idempotent_repair_20260826213807'
    )
  );
end;
$$;

select pg_notify('pgrst', 'reload schema');
