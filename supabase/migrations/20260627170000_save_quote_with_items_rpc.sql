-- Transactional commercial persistence for quotes/orders and their items.
-- Keeps parent and children consistent so a refresh never sees orphaned items
-- or a locally-created quote/order that was not really saved.

alter table public.quotes
  add column if not exists delivery_origin_address text,
  add column if not exists additional_services jsonb not null default '[]'::jsonb,
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.quote_items
  alter column created_at set default now(),
  alter column unit_price type numeric(12,4)
  using unit_price::numeric(12,4);

alter table public.orders
  add column if not exists delivery_origin_address text,
  add column if not exists additional_services jsonb not null default '[]'::jsonb,
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.order_items
  alter column created_at set default now(),
  alter column unit_price type numeric(12,4)
  using unit_price::numeric(12,4);

create or replace function public.save_quote_with_items(
  p_quote jsonb,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_company_id text := nullif(p_quote->>'company_id', '');
  v_current_company_id text := private.current_company_id();
  v_quote_id text := nullif(p_quote->>'id', '');
  v_quote_number integer := nullif(p_quote->>'number', '')::integer;
  v_now timestamptz := now();
  v_item jsonb;
  v_item_id text;
  v_product_id text;
  v_product_name text;
  v_saved_quote public.quotes%rowtype;
  v_saved_items jsonb := '[]'::jsonb;
begin
  if v_current_company_id is null then
    raise exception 'Empresa atual nao identificada para salvar orçamento.';
  end if;

  if v_company_id is null then
    v_company_id := v_current_company_id;
  end if;

  if v_company_id <> v_current_company_id then
    raise exception 'Empresa do orçamento nao corresponde ao usuario atual.';
  end if;

  if nullif(p_quote->>'customer_name', '') is null then
    raise exception 'Cliente do orçamento é obrigatório.';
  end if;

  if v_quote_id is null then
    v_quote_id := 'quote-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text;
  end if;

  if v_quote_number is null then
    select coalesce(max(q.number), 1000) + 1
      into v_quote_number
    from public.quotes q
    where q.company_id = v_company_id;
  end if;

  insert into public.quotes (
    id,
    company_id,
    customer_id,
    customer_name,
    number,
    status,
    total_amount,
    discount,
    valid_until,
    notes,
    delivery_type,
    delivery_origin_address,
    delivery_address,
    delivery_distance_km,
    delivery_fee,
    additional_services,
    created_at,
    updated_at
  )
  values (
    v_quote_id,
    v_company_id,
    nullif(p_quote->>'customer_id', ''),
    p_quote->>'customer_name',
    v_quote_number,
    coalesce(nullif(p_quote->>'status', ''), 'rascunho'),
    coalesce(nullif(p_quote->>'total_amount', '')::numeric, 0),
    coalesce(nullif(p_quote->>'discount', '')::numeric, 0),
    nullif(p_quote->>'valid_until', '')::date,
    nullif(p_quote->>'notes', ''),
    nullif(p_quote->>'delivery_type', ''),
    nullif(p_quote->>'delivery_origin_address', ''),
    nullif(p_quote->>'delivery_address', ''),
    coalesce(nullif(p_quote->>'delivery_distance_km', '')::numeric, 0),
    coalesce(nullif(p_quote->>'delivery_fee', '')::numeric, 0),
    coalesce(p_quote->'additional_services', '[]'::jsonb),
    coalesce(nullif(p_quote->>'created_at', '')::timestamptz, v_now),
    v_now
  )
  on conflict (id) do update set
    company_id = excluded.company_id,
    customer_id = excluded.customer_id,
    customer_name = excluded.customer_name,
    number = excluded.number,
    status = excluded.status,
    total_amount = excluded.total_amount,
    discount = excluded.discount,
    valid_until = excluded.valid_until,
    notes = excluded.notes,
    delivery_type = excluded.delivery_type,
    delivery_origin_address = excluded.delivery_origin_address,
    delivery_address = excluded.delivery_address,
    delivery_distance_km = excluded.delivery_distance_km,
    delivery_fee = excluded.delivery_fee,
    additional_services = excluded.additional_services,
    updated_at = v_now
  returning * into v_saved_quote;

  delete from public.quote_items qi
  where qi.quote_id = v_quote_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_product_name := nullif(v_item->>'product_name', '');
    if v_product_name is null then
      raise exception 'Item de orçamento sem nome de produto.';
    end if;

    v_item_id := coalesce(nullif(v_item->>'id', ''), 'qi-' || md5(v_quote_id || v_product_name || clock_timestamp()::text));
    v_product_id := nullif(v_item->>'product_id', '');

    insert into public.quote_items (
      id,
      quote_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      total_price,
      details,
      created_at
    )
    values (
      v_item_id,
      v_quote_id,
      v_product_id,
      v_product_name,
      coalesce(nullif(v_item->>'quantity', '')::numeric, 1),
      coalesce(nullif(v_item->>'unit_price', '')::numeric, 0),
      coalesce(nullif(v_item->>'total_price', '')::numeric, 0),
      coalesce(v_item->'details', '{}'::jsonb),
      coalesce(nullif(v_item->>'created_at', '')::timestamptz, v_now)
    );
  end loop;

  select coalesce(jsonb_agg(to_jsonb(qi) order by qi.created_at, qi.id), '[]'::jsonb)
    into v_saved_items
  from public.quote_items qi
  where qi.quote_id = v_quote_id;

  return jsonb_build_object(
    'quote', to_jsonb(v_saved_quote),
    'items', v_saved_items
  );
end;
$$;

create or replace function public.save_order_with_items(
  p_order jsonb,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_company_id text := nullif(p_order->>'company_id', '');
  v_current_company_id text := private.current_company_id();
  v_order_id text := nullif(p_order->>'id', '');
  v_order_number text := nullif(p_order->>'number', '');
  v_now timestamptz := now();
  v_next_number integer;
  v_item jsonb;
  v_item_id text;
  v_product_id text;
  v_product_name text;
  v_saved_order public.orders%rowtype;
  v_saved_items jsonb := '[]'::jsonb;
begin
  if v_current_company_id is null then
    raise exception 'Empresa atual nao identificada para salvar pedido.';
  end if;

  if v_company_id is null then
    v_company_id := v_current_company_id;
  end if;

  if v_company_id <> v_current_company_id then
    raise exception 'Empresa do pedido nao corresponde ao usuario atual.';
  end if;

  if nullif(p_order->>'customer_name', '') is null then
    raise exception 'Cliente do pedido é obrigatório.';
  end if;

  if v_order_id is null then
    v_order_id := 'order-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text;
  end if;

  if v_order_number is null then
    select coalesce(
      max(nullif(regexp_replace(o.number, '\D', '', 'g'), '')::integer),
      0
    ) + 1
      into v_next_number
    from public.orders o
    where o.company_id = v_company_id;

    v_order_number := 'ORD-' || lpad(v_next_number::text, 4, '0');
  end if;

  insert into public.orders (
    id,
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
    created_at,
    updated_at
  )
  values (
    v_order_id,
    v_company_id,
    nullif(p_order->>'customer_id', ''),
    p_order->>'customer_name',
    v_order_number,
    coalesce(nullif(p_order->>'status', ''), 'orcamento'),
    coalesce(nullif(p_order->>'total_amount', '')::numeric, 0),
    coalesce(nullif(p_order->>'paid_amount', '')::numeric, 0),
    coalesce(nullif(p_order->>'payment_status', ''), 'pendente'),
    coalesce(nullif(p_order->>'shipping_cost', '')::numeric, 0),
    nullif(p_order->>'deadline', '')::timestamptz,
    nullif(p_order->>'notes', ''),
    nullif(p_order->>'delivery_type', ''),
    nullif(p_order->>'delivery_origin_address', ''),
    nullif(p_order->>'delivery_address', ''),
    coalesce(nullif(p_order->>'delivery_distance_km', '')::numeric, 0),
    coalesce(p_order->'additional_services', '[]'::jsonb),
    coalesce(nullif(p_order->>'created_at', '')::timestamptz, v_now),
    v_now
  )
  on conflict (id) do update set
    company_id = excluded.company_id,
    customer_id = excluded.customer_id,
    customer_name = excluded.customer_name,
    number = excluded.number,
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
    updated_at = v_now
  returning * into v_saved_order;

  delete from public.order_items oi
  where oi.order_id = v_order_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_product_name := nullif(v_item->>'product_name', '');
    if v_product_name is null then
      raise exception 'Item de pedido sem nome de produto.';
    end if;

    v_item_id := coalesce(nullif(v_item->>'id', ''), 'oi-' || md5(v_order_id || v_product_name || clock_timestamp()::text));
    v_product_id := nullif(v_item->>'product_id', '');

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
      supplier_id,
      supplier_name,
      outsourced_cost,
      created_at
    )
    values (
      v_item_id,
      v_order_id,
      v_product_id,
      v_product_name,
      coalesce(nullif(v_item->>'quantity', '')::numeric, 1),
      coalesce(nullif(v_item->>'unit_price', '')::numeric, 0),
      coalesce(nullif(v_item->>'total_price', '')::numeric, 0),
      coalesce(v_item->'details', '{}'::jsonb),
      coalesce(nullif(v_item->>'outsourced', '')::boolean, false),
      nullif(v_item->>'supplier_id', ''),
      nullif(v_item->>'supplier_name', ''),
      coalesce(nullif(v_item->>'outsourced_cost', '')::numeric, 0),
      coalesce(nullif(v_item->>'created_at', '')::timestamptz, v_now)
    );
  end loop;

  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.created_at, oi.id), '[]'::jsonb)
    into v_saved_items
  from public.order_items oi
  where oi.order_id = v_order_id;

  return jsonb_build_object(
    'order', to_jsonb(v_saved_order),
    'items', v_saved_items
  );
end;
$$;

grant execute on function public.save_quote_with_items(jsonb, jsonb) to authenticated;
grant execute on function public.save_order_with_items(jsonb, jsonb) to authenticated;

select pg_notify('pgrst', 'reload schema');
