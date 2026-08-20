-- Restore the explicit Order -> Production command boundary and expose the
-- tenant-scoped B2B credit exposure from the canonical financial ledger.

create index if not exists financial_transactions_company_order_status_idx
  on public.financial_transactions(company_id, order_id, type, status);

create index if not exists financial_transactions_company_legacy_order_paid_idx
  on public.financial_transactions (
    company_id,
    ((case
      when btrim(coalesce(order_number, '')) ~* '^ORD-' then 'ped-' || lower(substr(btrim(order_number), 5))
      when btrim(coalesce(order_number, '')) ~* '^PED-' then lower(btrim(order_number))
      when btrim(coalesce(order_number, '')) ~ '^[0-9]+$' then 'ped-' || lpad(btrim(order_number), 4, '0')
      else lower(btrim(coalesce(order_number, '')))
    end))
  )
  where order_id is null
    and type = 'receita'
    and status = 'pago'
    and amount > 0;

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
  -- Existing operational rows keep their manual stage and ownership fields.
  -- Only the order/item projection is refreshed after an explicit order save.
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
    and o.status in ('producao', 'impressao', 'acabamento')
  on conflict (company_id, order_item_id) do nothing
  returning *;
end;
$$;

revoke all on function private.ensure_production_queue_for_order(text, text)
from public, anon, authenticated;

create or replace function public.ensure_production_queue_for_order(
  p_order_id text
)
returns setof public.production_queue
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id text := private.current_company_id();
begin
  if (select auth.uid()) is null
    or v_company_id is null
    or not private.current_user_can_access_operational_path('/production') then
    return;
  end if;

  return query
  select *
  from private.ensure_production_queue_for_order(p_order_id, v_company_id);
end;
$$;

revoke all on function public.ensure_production_queue_for_order(text)
from public, anon;
grant execute on function public.ensure_production_queue_for_order(text)
to authenticated;

-- Preserve stable order-item identities. The previous aggregate implementation
-- deleted every item before reinserting it; the FK cascade consequently deleted
-- production_queue rows and reset manually persisted stages on the next ensure.
create or replace function public.save_order_with_items(
  p_order jsonb,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company_id text := nullif(p_order ->> 'company_id', '');
  v_current_company_id text := private.current_company_id();
  v_order_id text := nullif(p_order ->> 'id', '');
  v_order_number text;
  v_existing_number text;
  v_now timestamptz := clock_timestamp();
  v_item jsonb;
  v_item_id text;
  v_product_id text;
  v_product_name text;
  v_keep_item_ids text[] := array[]::text[];
  v_saved_order public.orders%rowtype;
  v_saved_items jsonb := '[]'::jsonb;
  v_affected integer;
begin
  if v_current_company_id is null then
    raise exception 'Empresa atual nao identificada para salvar pedido.';
  end if;

  v_company_id := coalesce(v_company_id, v_current_company_id);
  if v_company_id <> v_current_company_id then
    raise exception 'Empresa do pedido nao corresponde ao usuario atual.';
  end if;
  if nullif(p_order ->> 'customer_name', '') is null then
    raise exception 'Cliente do pedido e obrigatorio.';
  end if;

  if v_order_id is not null then
    select o.number into v_existing_number
    from public.orders o
    where o.id = v_order_id and o.company_id = v_company_id;
  end if;

  if v_existing_number is not null then
    v_order_number := v_existing_number;
  else
    v_order_id := coalesce(v_order_id, gen_random_uuid()::text);
    v_order_number := private.next_order_number(v_company_id);
  end if;

  insert into public.orders (
    id, company_id, customer_id, customer_name, number, status,
    total_amount, paid_amount, payment_status, shipping_cost, deadline, notes,
    delivery_type, delivery_origin_address, delivery_address, delivery_distance_km,
    additional_services, created_at, updated_at
  ) values (
    v_order_id, v_company_id, nullif(p_order ->> 'customer_id', ''), p_order ->> 'customer_name',
    v_order_number, coalesce(nullif(p_order ->> 'status', ''), 'orcamento'),
    coalesce(nullif(p_order ->> 'total_amount', '')::numeric, 0),
    coalesce(nullif(p_order ->> 'paid_amount', '')::numeric, 0),
    coalesce(nullif(p_order ->> 'payment_status', ''), 'pendente'),
    coalesce(nullif(p_order ->> 'shipping_cost', '')::numeric, 0),
    nullif(p_order ->> 'deadline', '')::timestamptz,
    nullif(p_order ->> 'notes', ''),
    nullif(p_order ->> 'delivery_type', ''),
    nullif(p_order ->> 'delivery_origin_address', ''),
    nullif(p_order ->> 'delivery_address', ''),
    coalesce(nullif(p_order ->> 'delivery_distance_km', '')::numeric, 0),
    coalesce(p_order -> 'additional_services', '[]'::jsonb),
    coalesce(nullif(p_order ->> 'created_at', '')::timestamptz, v_now),
    v_now
  )
  on conflict (id) do update set
    customer_id = excluded.customer_id,
    customer_name = excluded.customer_name,
    status = excluded.status,
    total_amount = excluded.total_amount,
    paid_amount = excluded.paid_amount,
    payment_status = excluded.payment_status,
    shipping_cost = excluded.shipping_cost,
    deadline = excluded.deadline,
    notes = excluded.notes,
    delivery_type = excluded.delivery_type,
    delivery_origin_address = excluded.delivery_origin_address,
    delivery_address = excluded.delivery_address,
    delivery_distance_km = excluded.delivery_distance_km,
    additional_services = excluded.additional_services,
    updated_at = excluded.updated_at
  returning * into v_saved_order;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_product_name := nullif(v_item ->> 'product_name', '');
    if v_product_name is null then
      raise exception 'Item de pedido sem nome de produto.';
    end if;
    v_item_id := nullif(v_item ->> 'id', '');
    if v_item_id is null then
      raise exception using errcode = '22023', message = 'ORDER_ITEM_ID_REQUIRED';
    end if;
    v_product_id := nullif(v_item ->> 'product_id', '');
    v_keep_item_ids := array_append(v_keep_item_ids, v_item_id);

    insert into public.order_items (
      id, order_id, product_id, product_name, quantity, unit_price, total_price,
      details, outsourced, supplier_id, supplier_name, outsourced_cost, created_at
    ) values (
      v_item_id, v_order_id, v_product_id, v_product_name,
      coalesce(nullif(v_item ->> 'quantity', '')::numeric, 1),
      coalesce(nullif(v_item ->> 'unit_price', '')::numeric, 0),
      coalesce(nullif(v_item ->> 'total_price', '')::numeric, 0),
      coalesce(v_item -> 'details', '{}'::jsonb),
      coalesce(nullif(v_item ->> 'outsourced', '')::boolean, false),
      nullif(v_item ->> 'supplier_id', ''),
      nullif(v_item ->> 'supplier_name', ''),
      coalesce(nullif(v_item ->> 'outsourced_cost', '')::numeric, 0),
      coalesce(nullif(v_item ->> 'created_at', '')::timestamptz, v_now)
    )
    on conflict (id) do update set
      product_id = excluded.product_id,
      product_name = excluded.product_name,
      quantity = excluded.quantity,
      unit_price = excluded.unit_price,
      total_price = excluded.total_price,
      details = excluded.details,
      outsourced = excluded.outsourced,
      supplier_id = excluded.supplier_id,
      supplier_name = excluded.supplier_name,
      outsourced_cost = excluded.outsourced_cost
    where public.order_items.order_id = v_order_id;

    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception 'Item de pedido pertence a outro pedido.';
    end if;
  end loop;

  delete from public.order_items oi
  where oi.order_id = v_order_id
    and not (oi.id = any(v_keep_item_ids));

  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.created_at, oi.id), '[]'::jsonb)
  into v_saved_items
  from public.order_items oi
  where oi.order_id = v_order_id;

  return jsonb_build_object('order', to_jsonb(v_saved_order), 'items', v_saved_items);
end;
$$;

revoke all on function public.save_order_with_items(jsonb, jsonb)
from public, anon, authenticated;

create or replace function public.save_order_with_items_and_production(
  p_order jsonb,
  p_items jsonb default '[]'::jsonb,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_company_id text := private.current_company_id();
  v_order_id text;
  v_production jsonb := '[]'::jsonb;
begin
  v_result := public.save_order_with_items_phase4b(
    p_order,
    p_items,
    p_expected_updated_at
  );

  if v_result ->> 'result_status' = 'UPDATED' then
    v_order_id := v_result #>> '{payload,order,id}';
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at, q.id), '[]'::jsonb)
    into v_production
    from private.ensure_production_queue_for_order(v_order_id, v_company_id) q;
    v_result := v_result || jsonb_build_object('production', v_production);
  end if;

  return v_result;
end;
$$;

revoke all on function public.save_order_with_items_and_production(jsonb, jsonb, timestamptz)
from public, anon;
grant execute on function public.save_order_with_items_and_production(jsonb, jsonb, timestamptz)
to authenticated;

create or replace function public.transition_order_status_and_production(
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
  v_result jsonb;
  v_company_id text := private.current_company_id();
  v_production jsonb := '[]'::jsonb;
begin
  v_result := public.transition_order_status_phase4b(
    p_order_id,
    p_status,
    p_expected_updated_at
  );

  if v_result ->> 'status' in ('UPDATED', 'UNCHANGED') then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at, q.id), '[]'::jsonb)
    into v_production
    from private.ensure_production_queue_for_order(p_order_id, v_company_id) q;
    v_result := v_result || jsonb_build_object('production', v_production);
  end if;

  return v_result;
end;
$$;

revoke all on function public.transition_order_status_and_production(text, text, timestamptz)
from public, anon;
grant execute on function public.transition_order_status_and_production(text, text, timestamptz)
to authenticated;

create or replace function public.record_order_payment_and_production(
  p_order_id text,
  p_amount numeric,
  p_method text,
  p_payment_type text default null,
  p_paid_at timestamptz default null,
  p_notes text default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_company_id text := private.current_company_id();
  v_production jsonb := '[]'::jsonb;
begin
  v_result := public.record_order_payment_phase4b(
    p_order_id,
    p_amount,
    p_method,
    p_payment_type,
    p_paid_at,
    p_notes,
    p_expected_updated_at
  );

  if v_result ->> 'status' in ('UPDATED', 'UNCHANGED') then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at, q.id), '[]'::jsonb)
    into v_production
    from private.ensure_production_queue_for_order(p_order_id, v_company_id) q;
    v_result := v_result || jsonb_build_object('production', v_production);
  end if;

  return v_result;
end;
$$;

revoke all on function public.record_order_payment_and_production(
  text, numeric, text, text, timestamptz, text, timestamptz
)
from public, anon;
grant execute on function public.record_order_payment_and_production(
  text, numeric, text, text, timestamptz, text, timestamptz
)
to authenticated;

-- The transactional wrappers above are the only authenticated mutation
-- boundary for orders. Keeping the Phase 4B commands or direct table writes
-- callable would let stale clients bypass production-queue creation.
revoke all on function public.save_order_with_items_phase4b(jsonb, jsonb, timestamptz)
from authenticated;
revoke all on function public.transition_order_status_phase4b(text, text, timestamptz)
from authenticated;
revoke all on function public.record_order_payment_phase4b(
  text, numeric, text, text, timestamptz, text, timestamptz
)
from authenticated;

revoke insert, update on table public.orders
from public, anon, authenticated;
revoke insert, update on table public.order_items
from public, anon, authenticated;

create or replace function public.get_b2b_credit_exposure()
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id text := private.current_company_id();
  v_total numeric := 0;
begin
  if (select auth.uid()) is null
    or v_company_id is null
    or not private.current_user_can_access_path('/orders') then
    raise exception using errcode = '42501', message = 'B2B_EXPOSURE_NOT_AUTHORIZED';
  end if;

  with eligible_orders as (
    select
      o.*,
      case
        when btrim(coalesce(o.number, '')) ~* '^ORD-' then 'ped-' || lower(substr(btrim(o.number), 5))
        when btrim(coalesce(o.number, '')) ~* '^PED-' then lower(btrim(o.number))
        when btrim(coalesce(o.number, '')) ~ '^[0-9]+$' then 'ped-' || lpad(btrim(o.number), 4, '0')
        else lower(btrim(coalesce(o.number, '')))
      end as normalized_order_number
    from public.orders o
    join lateral (
      select c.billing_type
      from public.customers c
      where c.company_id = o.company_id
        and (
          c.id = o.customer_id
          or lower(btrim(c.name)) = lower(btrim(o.customer_name))
        )
      order by (c.id = o.customer_id) desc, c.id
      limit 1
    ) c on c.billing_type = 'faturado'
    where o.company_id = v_company_id
      and lower(btrim(coalesce(o.status, ''))) not in ('cancelado', 'cancelada', 'cancelled', 'canceled')
  ), paid_by_order as (
    select
      o.id as order_id,
      coalesce(sum(payment.amount), 0) as paid_amount
    from eligible_orders o
    left join lateral (
      select f.amount
      from public.financial_transactions f
      where f.company_id = o.company_id
        and f.order_id = o.id
        and f.type = 'receita'
        and f.status = 'pago'
        and f.amount > 0
      union all
      select f.amount
      from public.financial_transactions f
      where f.company_id = o.company_id
        and f.order_id is null
        and f.type = 'receita'
        and f.status = 'pago'
        and f.amount > 0
        and case
          when btrim(coalesce(f.order_number, '')) ~* '^ORD-' then 'ped-' || lower(substr(btrim(f.order_number), 5))
          when btrim(coalesce(f.order_number, '')) ~* '^PED-' then lower(btrim(f.order_number))
          when btrim(coalesce(f.order_number, '')) ~ '^[0-9]+$' then 'ped-' || lpad(btrim(f.order_number), 4, '0')
          else lower(btrim(coalesce(f.order_number, '')))
        end = o.normalized_order_number
    ) payment on true
    group by o.id
  )
  select coalesce(sum(greatest(
    0,
    coalesce(o.total_amount, 0) - greatest(coalesce(o.paid_amount, 0), p.paid_amount)
  )), 0)
  into v_total
  from eligible_orders o
  join paid_by_order p on p.order_id = o.id;

  return round(v_total, 2);
end;
$$;

revoke all on function public.get_b2b_credit_exposure()
from public, anon;
grant execute on function public.get_b2b_credit_exposure()
to authenticated;

select pg_notify('pgrst', 'reload schema');
