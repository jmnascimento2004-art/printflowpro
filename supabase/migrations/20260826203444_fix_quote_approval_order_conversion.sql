-- Restore quote approval after authenticated direct writes to orders and
-- order_items were intentionally revoked. The RPC remains the single atomic
-- boundary: it authorizes the actor explicitly and performs privileged writes
-- without reopening either table to browser clients.

create or replace function public.approve_quote_and_create_order(p_quote_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id text := private.current_company_id();
  v_actor public.profiles%rowtype;
  v_quote public.quotes%rowtype;
  v_order public.orders%rowtype;
  v_order_items jsonb := '[]'::jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null
    or v_company_id is null
    or not private.current_user_can_access_path('/quotes') then
    raise exception using errcode = '42501', message = 'QUOTE_APPROVAL_NOT_AUTHORIZED';
  end if;

  select p.*
  into v_actor
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

revoke all on function public.approve_quote_and_create_order(text)
from public, anon;
grant execute on function public.approve_quote_and_create_order(text)
to authenticated;

select pg_notify('pgrst', 'reload schema');
