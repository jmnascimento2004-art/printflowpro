-- Atomic, tenant-scoped order numbering and quote conversion.

create table if not exists private.order_number_counters (
  company_id text primary key references public.companies(id) on delete cascade,
  last_number bigint not null check (last_number >= 0),
  updated_at timestamptz not null default now()
);

revoke all on table private.order_number_counters from public, anon, authenticated;

insert into private.order_number_counters (company_id, last_number)
select
  o.company_id,
  max(substring(o.number from '[0-9]+$')::bigint)
from public.orders o
where o.number ~ '^(PED|ORD)-[0-9]+$'
group by o.company_id
on conflict (company_id) do update
set last_number = greatest(private.order_number_counters.last_number, excluded.last_number),
    updated_at = now();

do $$
begin
  if exists (
    select 1
    from public.orders
    group by company_id, number
    having count(*) > 1
  ) then
    raise exception 'Nao foi possivel garantir unicidade: existem numeros de pedido duplicados por empresa.';
  end if;
end;
$$;

create unique index if not exists orders_company_number_unique
  on public.orders (company_id, number);

alter table public.orders
  add column if not exists source_quote_id text references public.quotes(id) on delete set null;

create unique index if not exists orders_company_source_quote_unique
  on public.orders (company_id, source_quote_id)
  where source_quote_id is not null;

create or replace function private.next_order_number(p_company_id text)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_current_company_id text := private.current_company_id();
  v_next_number bigint;
begin
  if auth.uid() is null or v_current_company_id is null then
    raise exception 'Empresa atual nao identificada para gerar numero de pedido.';
  end if;

  if p_company_id is null or p_company_id <> v_current_company_id then
    raise exception 'Empresa do pedido nao corresponde ao usuario atual.';
  end if;

  insert into private.order_number_counters (company_id, last_number)
  values (
    p_company_id,
    coalesce((
      select max(substring(o.number from '[0-9]+$')::bigint)
      from public.orders o
      where o.company_id = p_company_id
        and o.number ~ '^(PED|ORD)-[0-9]+$'
    ), 0) + 1
  )
  on conflict (company_id) do update
  set last_number = private.order_number_counters.last_number + 1,
      updated_at = now()
  returning last_number into v_next_number;

  return 'PED-' || lpad(v_next_number::text, 4, '0');
end;
$$;

revoke all on function private.next_order_number(text) from public, anon;
grant execute on function private.next_order_number(text) to authenticated;

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
  v_order_number text;
  v_existing_number text;
  v_now timestamptz := now();
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
    if v_order_id is null then
      v_order_id := gen_random_uuid()::text;
    end if;
    v_order_number := private.next_order_number(v_company_id);
  end if;

  insert into public.orders (
    id, company_id, customer_id, customer_name, number, status,
    total_amount, paid_amount, payment_status, shipping_cost, deadline, notes,
    delivery_type, delivery_origin_address, delivery_address, delivery_distance_km,
    additional_services, created_at, updated_at
  ) values (
    v_order_id, v_company_id, nullif(p_order->>'customer_id', ''), p_order->>'customer_name',
    v_order_number, coalesce(nullif(p_order->>'status', ''), 'orcamento'),
    coalesce(nullif(p_order->>'total_amount', '')::numeric, 0),
    coalesce(nullif(p_order->>'paid_amount', '')::numeric, 0),
    coalesce(nullif(p_order->>'payment_status', ''), 'pendente'),
    coalesce(nullif(p_order->>'shipping_cost', '')::numeric, 0),
    nullif(p_order->>'deadline', '')::timestamptz, nullif(p_order->>'notes', ''),
    nullif(p_order->>'delivery_type', ''), nullif(p_order->>'delivery_origin_address', ''),
    nullif(p_order->>'delivery_address', ''),
    coalesce(nullif(p_order->>'delivery_distance_km', '')::numeric, 0),
    coalesce(p_order->'additional_services', '[]'::jsonb),
    coalesce(nullif(p_order->>'created_at', '')::timestamptz, v_now), v_now
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
    updated_at = v_now
  returning * into v_saved_order;

  delete from public.order_items oi where oi.order_id = v_order_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_product_name := nullif(v_item->>'product_name', '');
    if v_product_name is null then
      raise exception 'Item de pedido sem nome de produto.';
    end if;
    v_item_id := coalesce(nullif(v_item->>'id', ''), 'oi-' || md5(v_order_id || v_product_name || clock_timestamp()::text));
    v_product_id := nullif(v_item->>'product_id', '');

    insert into public.order_items (
      id, order_id, product_id, product_name, quantity, unit_price, total_price,
      details, outsourced, supplier_id, supplier_name, outsourced_cost, created_at
    ) values (
      v_item_id, v_order_id, v_product_id, v_product_name,
      coalesce(nullif(v_item->>'quantity', '')::numeric, 1),
      coalesce(nullif(v_item->>'unit_price', '')::numeric, 0),
      coalesce(nullif(v_item->>'total_price', '')::numeric, 0),
      coalesce(v_item->'details', '{}'::jsonb),
      coalesce(nullif(v_item->>'outsourced', '')::boolean, false),
      nullif(v_item->>'supplier_id', ''), nullif(v_item->>'supplier_name', ''),
      coalesce(nullif(v_item->>'outsourced_cost', '')::numeric, 0),
      coalesce(nullif(v_item->>'created_at', '')::timestamptz, v_now)
    );
  end loop;

  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.created_at, oi.id), '[]'::jsonb)
  into v_saved_items
  from public.order_items oi
  where oi.order_id = v_order_id;

  return jsonb_build_object('order', to_jsonb(v_saved_order), 'items', v_saved_items);
end;
$$;

create or replace function public.approve_quote_and_create_order(p_quote_id text)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_company_id text := private.current_company_id();
  v_quote public.quotes%rowtype;
  v_order public.orders%rowtype;
  v_order_items jsonb := '[]'::jsonb;
  v_now timestamptz := now();
begin
  if v_company_id is null then
    raise exception 'Empresa atual nao identificada para aprovar orcamento.';
  end if;

  select q.* into v_quote
  from public.quotes q
  where q.id = p_quote_id and q.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Orcamento nao encontrado para a empresa atual.';
  end if;

  select o.* into v_order
  from public.orders o
  where o.company_id = v_company_id and o.source_quote_id = v_quote.id;

  if not found then
    insert into public.orders (
      company_id, customer_id, customer_name, number, status, total_amount,
      paid_amount, payment_status, shipping_cost, deadline, notes,
      delivery_type, delivery_origin_address, delivery_address, delivery_distance_km,
      additional_services, source_quote_id, created_at, updated_at
    ) values (
      v_company_id, v_quote.customer_id, v_quote.customer_name,
      private.next_order_number(v_company_id), 'aguardando_pagamento', v_quote.total_amount,
      0, 'pendente', coalesce(v_quote.delivery_fee, 0), v_now + interval '5 days',
      'Convertido do Orcamento #' || v_quote.number ||
        case when nullif(trim(v_quote.notes), '') is null then '.' else '. ' || trim(v_quote.notes) end,
      v_quote.delivery_type, v_quote.delivery_origin_address, v_quote.delivery_address,
      coalesce(v_quote.delivery_distance_km, 0), coalesce(v_quote.additional_services, '[]'::jsonb),
      v_quote.id, v_now, v_now
    ) returning * into v_order;

    insert into public.order_items (
      id, order_id, product_id, product_name, quantity, unit_price, total_price,
      details, outsourced, outsourced_cost, created_at
    )
    select
      gen_random_uuid()::text, v_order.id, qi.product_id, qi.product_name,
      qi.quantity, qi.unit_price, qi.total_price, qi.details, false, 0, v_now
    from public.quote_items qi
    where qi.quote_id = v_quote.id;
  end if;

  update public.quotes
  set status = 'aprovado', updated_at = v_now
  where id = v_quote.id and company_id = v_company_id
  returning * into v_quote;

  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.created_at, oi.id), '[]'::jsonb)
  into v_order_items
  from public.order_items oi
  where oi.order_id = v_order.id;

  return jsonb_build_object(
    'quote', to_jsonb(v_quote),
    'order', to_jsonb(v_order),
    'items', v_order_items
  );
end;
$$;

revoke all on function public.approve_quote_and_create_order(text) from public, anon;
grant execute on function public.approve_quote_and_create_order(text) to authenticated;
revoke all on function public.save_order_with_items(jsonb, jsonb) from public, anon;
grant execute on function public.save_order_with_items(jsonb, jsonb) to authenticated;

select pg_notify('pgrst', 'reload schema');
