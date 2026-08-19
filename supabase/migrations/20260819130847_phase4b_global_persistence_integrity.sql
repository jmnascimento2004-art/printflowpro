-- Phase 4B: replace client snapshot persistence with explicit, tenant-scoped
-- commands. This migration is additive and does not rewrite business data.

alter table public.store_banners
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists set_timestamp_store_banners on public.store_banners;
create trigger set_timestamp_store_banners
before update on public.store_banners
for each row execute procedure public.trigger_set_timestamp();

drop trigger if exists set_timestamp_role_permissions on public.role_permissions;
create trigger set_timestamp_role_permissions
before update on public.role_permissions
for each row execute procedure public.trigger_set_timestamp();

create unique index if not exists shipments_company_order_unique
  on public.shipments(company_id, order_id);

create unique index if not exists cash_register_one_open_session_per_company
  on public.cash_register_sessions(company_id)
  where status = 'aberto';

create or replace function private.current_user_can_access_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select p.company_id, p.role
    from public.profiles p
    where p.auth_user_id = (select auth.uid())
      and p.active = true
    order by p.id
    limit 1
  ), configured as (
    select rp.roles
    from actor a
    join public.role_permissions rp
      on rp.company_id = a.company_id
     and rp.path = p_path
  )
  select coalesce((
    select case
      when a.role = 'admin' then true
      when exists (select 1 from configured) then (
        select a.role = any(c.roles) from configured c limit 1
      )
      when p_path = '/pos' then a.role in ('gerente', 'financeiro', 'vendas')
      when p_path = '/financial' then a.role in ('gerente', 'financeiro')
      when p_path = '/stock' then a.role in ('gerente', 'financeiro', 'producao', 'estoque')
      when p_path = '/shipment' then a.role in ('gerente', 'financeiro', 'producao')
      when p_path = '/products' then a.role in ('gerente', 'financeiro', 'vendas', 'producao', 'arte_finalista', 'estoque')
      when p_path = '/orders' then a.role in ('gerente', 'financeiro', 'vendas', 'producao', 'arte_finalista', 'estoque')
      when p_path = '/quotes' then a.role in ('gerente', 'financeiro', 'vendas')
      when p_path = '/settings' then a.role = 'gerente'
      else false
    end
    from actor a
  ), false)
$$;

revoke all on function private.current_user_can_access_path(text) from public, anon;
grant execute on function private.current_user_can_access_path(text) to authenticated;

create or replace function private.phase4b_audit_business_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_company_id text;
  v_entity_id text;
  v_module text;
  v_action text;
  v_old_safe jsonb := '{}'::jsonb;
  v_new_safe jsonb := '{}'::jsonb;
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;

  select p.* into v_actor
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
    and p.active = true
  order by p.id
  limit 1;

  if not found then
    raise exception using errcode = '42501', message = 'PHASE4B_ACTOR_NOT_AUTHORIZED';
  end if;

  v_company_id := coalesce(v_new ->> 'company_id', v_old ->> 'company_id', v_actor.company_id);
  v_entity_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_company_id);

  if tg_table_name = 'cash_register_sessions' then
    v_company_id := coalesce(v_new ->> 'company_id', v_old ->> 'company_id');
  end if;

  if v_company_id is distinct from v_actor.company_id then
    raise exception using errcode = '42501', message = 'PHASE4B_TENANT_MISMATCH';
  end if;

  case tg_table_name
    when 'customers' then
      v_module := 'customers';
      v_action := case tg_op when 'INSERT' then 'customer.created' when 'DELETE' then 'customer.deleted' else 'customer.updated' end;
      v_old_safe := jsonb_build_object(
        'name', v_old -> 'name', 'tags', v_old -> 'tags', 'billing_type', v_old -> 'billing_type',
        'credit_limit', v_old -> 'credit_limit', 'credit_used', v_old -> 'credit_used', 'credit_status', v_old -> 'credit_status'
      );
      v_new_safe := jsonb_build_object(
        'name', v_new -> 'name', 'tags', v_new -> 'tags', 'billing_type', v_new -> 'billing_type',
        'credit_limit', v_new -> 'credit_limit', 'credit_used', v_new -> 'credit_used', 'credit_status', v_new -> 'credit_status'
      );
    when 'products' then
      if tg_op = 'UPDATE'
         and (v_old - 'updated_at' - 'current_stock') = (v_new - 'updated_at' - 'current_stock') then
        return coalesce(new, old);
      end if;
      v_module := 'products';
      v_action := case tg_op when 'INSERT' then 'product.created' when 'DELETE' then 'product.deleted' else 'product.updated' end;
      v_old_safe := v_old - array['company_id','created_at','updated_at','image_url'];
      v_new_safe := v_new - array['company_id','created_at','updated_at','image_url'];
    when 'categories' then
      v_module := 'categories';
      v_action := case tg_op when 'INSERT' then 'category.created' when 'DELETE' then 'category.deleted' else 'category.updated' end;
      v_old_safe := v_old - array['company_id','created_at','updated_at','catalog_mega_menu_banner_image_url'];
      v_new_safe := v_new - array['company_id','created_at','updated_at','catalog_mega_menu_banner_image_url'];
    when 'financial_transactions' then
      v_module := 'financial';
      v_action := case tg_op when 'INSERT' then 'financial.transaction_created' when 'DELETE' then 'financial.transaction_deleted' else 'financial.payment_changed' end;
      v_old_safe := v_old - array['company_id','created_at','updated_at','description'];
      v_new_safe := v_new - array['company_id','created_at','updated_at','description'];
    when 'stock_movements' then
      v_module := 'stock';
      v_action := 'inventory.adjusted';
      v_old_safe := v_old - array['company_id','created_at','reason'];
      v_new_safe := v_new - array['company_id','created_at','reason'];
    when 'shipments' then
      v_module := 'shipment';
      v_action := case tg_op when 'INSERT' then 'shipment.created' when 'DELETE' then 'shipment.deleted' else 'shipment.status_changed' end;
      v_old_safe := v_old - array['company_id','created_at','updated_at','address','customer_name'];
      v_new_safe := v_new - array['company_id','created_at','updated_at','address','customer_name'];
    when 'settings' then
      v_module := 'settings';
      v_action := 'catalog.configuration_changed';
      v_entity_id := v_company_id;
      v_old_safe := v_old - array['company_id','created_at','updated_at','pix_key'];
      v_new_safe := v_new - array['company_id','created_at','updated_at','pix_key'];
    when 'companies' then
      v_module := 'settings';
      v_action := 'company.configuration_changed';
      v_company_id := coalesce(v_new ->> 'id', v_old ->> 'id');
      v_entity_id := v_company_id;
      if v_company_id is distinct from v_actor.company_id then
        raise exception using errcode = '42501', message = 'PHASE4B_TENANT_MISMATCH';
      end if;
      v_old_safe := jsonb_build_object('name', v_old -> 'name', 'theme_color', v_old -> 'theme_color', 'store_domain', v_old -> 'store_domain', 'custom_domain_status', v_old -> 'custom_domain_status');
      v_new_safe := jsonb_build_object('name', v_new -> 'name', 'theme_color', v_new -> 'theme_color', 'store_domain', v_new -> 'store_domain', 'custom_domain_status', v_new -> 'custom_domain_status');
    when 'pickup_points' then
      v_module := 'settings';
      v_action := case tg_op when 'INSERT' then 'pickup_point.created' when 'DELETE' then 'pickup_point.deleted' else 'pickup_point.updated' end;
      v_old_safe := jsonb_build_object('name', v_old -> 'name', 'active', v_old -> 'active');
      v_new_safe := jsonb_build_object('name', v_new -> 'name', 'active', v_new -> 'active');
    when 'store_banners' then
      v_module := 'catalog';
      v_action := case tg_op when 'INSERT' then 'catalog.banner_created' when 'DELETE' then 'catalog.banner_deleted' else 'catalog.banner_updated' end;
      v_old_safe := v_old - array['company_id','created_at','updated_at','image_url','mobile_image_url'];
      v_new_safe := v_new - array['company_id','created_at','updated_at','image_url','mobile_image_url'];
    when 'role_permissions' then
      v_module := 'settings';
      v_action := case tg_op when 'INSERT' then 'user.permission_created' when 'DELETE' then 'user.permission_deleted' else 'user.permission_changed' end;
      v_old_safe := jsonb_build_object('path', v_old -> 'path', 'roles', v_old -> 'roles');
      v_new_safe := jsonb_build_object('path', v_new -> 'path', 'roles', v_new -> 'roles');
    when 'cash_register_sessions' then
      v_module := 'pos';
      v_action := case
        when tg_op = 'INSERT' then 'cash_register.opened'
        when v_new ->> 'status' = 'fechado' and v_old ->> 'status' = 'aberto' then 'cash_register.closed'
        else 'cash_register.balance_changed'
      end;
      v_old_safe := v_old - array['company_id','created_at','updated_at','notes','opened_by'];
      v_new_safe := v_new - array['company_id','created_at','updated_at','notes','opened_by'];
    else
      return coalesce(new, old);
  end case;

  if tg_op = 'UPDATE' and v_old_safe = v_new_safe then
    return coalesce(new, old);
  end if;

  insert into public.audit_logs (
    company_id, actor_user_id, actor_profile_id, actor_name, actor_role,
    action, entity_type, entity_id, module, old_values, new_values, metadata
  ) values (
    v_company_id, (select auth.uid()), v_actor.id, v_actor.name, v_actor.role,
    v_action, tg_table_name, v_entity_id, v_module, v_old_safe, v_new_safe,
    jsonb_build_object('source', 'phase4b_explicit_command')
  );

  return coalesce(new, old);
end;
$$;

revoke all on function private.phase4b_audit_business_mutation() from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'customers','products','categories','financial_transactions','stock_movements','shipments',
    'settings','companies','pickup_points','store_banners','role_permissions',
    'cash_register_sessions'
  ] loop
    execute format('drop trigger if exists phase4b_audit_business_mutation on public.%I', v_table);
    execute format(
      'create trigger phase4b_audit_business_mutation after insert or update or delete on public.%I for each row execute function private.phase4b_audit_business_mutation()',
      v_table
    );
  end loop;
end;
$$;

create or replace function public.adjust_inventory_stock(
  p_product_id text,
  p_quantity numeric,
  p_type text,
  p_reason text,
  p_unit_cost numeric default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id text := private.current_company_id();
  v_product public.products%rowtype;
  v_movement public.stock_movements%rowtype;
  v_delta numeric;
begin
  if (select auth.uid()) is null or v_company_id is null
     or not private.current_user_can_access_path('/stock') then
    return jsonb_build_object('status', 'NOT_AUTHORIZED');
  end if;
  if p_quantity is null or p_quantity <= 0 or p_type not in ('entrada','saida') then
    return jsonb_build_object('status', 'INVALID_INPUT');
  end if;

  select p.* into v_product
  from public.products p
  where p.id = p_product_id and p.company_id = v_company_id
  for update;
  if not found then return jsonb_build_object('status', 'NOT_FOUND'); end if;
  if p_expected_updated_at is not null and v_product.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('status', 'CONFLICT', 'product', to_jsonb(v_product));
  end if;

  v_delta := case when p_type = 'entrada' then p_quantity else -p_quantity end;
  if v_product.current_stock + v_delta < 0 then
    return jsonb_build_object('status', 'INSUFFICIENT_STOCK', 'product', to_jsonb(v_product));
  end if;

  update public.products p
  set current_stock = p.current_stock + v_delta
  where p.id = v_product.id
  returning p.* into v_product;

  insert into public.stock_movements(company_id, product_id, product_name, type, quantity, reason, unit_cost)
  values (v_company_id, v_product.id, v_product.name, p_type, p_quantity, nullif(btrim(p_reason), ''), coalesce(p_unit_cost, v_product.base_cost, 0))
  returning * into v_movement;

  return jsonb_build_object('status', 'UPDATED', 'product', to_jsonb(v_product), 'movement', to_jsonb(v_movement));
end;
$$;

revoke all on function public.adjust_inventory_stock(text,numeric,text,text,numeric,timestamptz) from public, anon;
grant execute on function public.adjust_inventory_stock(text,numeric,text,text,numeric,timestamptz) to authenticated;

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
  if p_status not in ('separacao','embalagem','enviado','entregue') then
    return jsonb_build_object('status', 'INVALID_INPUT');
  end if;

  select s.* into v_shipment
  from public.shipments s
  where s.id = p_shipment_id and s.company_id = v_company_id
  for update;
  if not found then return jsonb_build_object('status', 'NOT_FOUND'); end if;
  if p_expected_updated_at is not null and v_shipment.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('status', 'CONFLICT', 'shipment', to_jsonb(v_shipment));
  end if;
  if v_shipment.status = p_status
     and coalesce(p_tracking_code, v_shipment.tracking_code) is not distinct from v_shipment.tracking_code
     and coalesce(p_carrier, v_shipment.carrier) is not distinct from v_shipment.carrier then
    return jsonb_build_object('status', 'UNCHANGED', 'shipment', to_jsonb(v_shipment));
  end if;

  update public.shipments s set
    status = p_status,
    tracking_code = coalesce(nullif(btrim(p_tracking_code), ''), s.tracking_code),
    carrier = coalesce(nullif(btrim(p_carrier), ''), s.carrier),
    shipped_at = case when p_status = 'enviado' then coalesce(s.shipped_at, clock_timestamp()) else s.shipped_at end,
    delivered_at = case when p_status = 'entregue' then coalesce(s.delivered_at, clock_timestamp()) else s.delivered_at end
  where s.id = v_shipment.id
  returning s.* into v_shipment;

  if p_status = 'entregue' then
    update public.orders o set status = 'entregue'
    where o.id = v_shipment.order_id and o.company_id = v_company_id and o.status <> 'finalizado';
  end if;

  return jsonb_build_object('status', 'UPDATED', 'shipment', to_jsonb(v_shipment));
end;
$$;

revoke all on function public.transition_shipment(text,text,text,text,timestamptz) from public, anon;
grant execute on function public.transition_shipment(text,text,text,text,timestamptz) to authenticated;

create or replace function public.settle_financial_transaction(
  p_transaction_id text,
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
  v_transaction public.financial_transactions%rowtype;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
begin
  if (select auth.uid()) is null or v_company_id is null
     or not private.current_user_can_access_path('/financial') then
    return jsonb_build_object('status', 'NOT_AUTHORIZED');
  end if;
  if p_status not in ('pendente','pago') then return jsonb_build_object('status', 'INVALID_INPUT'); end if;

  select f.* into v_transaction
  from public.financial_transactions f
  where f.id = p_transaction_id and f.company_id = v_company_id
  for update;
  if not found then return jsonb_build_object('status', 'NOT_FOUND'); end if;
  if p_expected_updated_at is not null and v_transaction.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('status', 'CONFLICT', 'transaction', to_jsonb(v_transaction));
  end if;
  if v_transaction.status = p_status then
    return jsonb_build_object('status', 'UNCHANGED', 'transaction', to_jsonb(v_transaction));
  end if;

  if v_transaction.type = 'receita' and v_transaction.order_id is not null
     and v_transaction.status is distinct from p_status then
    select o.* into v_order from public.orders o
    where o.id = v_transaction.order_id and o.company_id = v_company_id for update;
    if found then
      update public.orders o set
        paid_amount = case
          when p_status = 'pago' then least(o.total_amount, o.paid_amount + v_transaction.amount)
          else greatest(0, o.paid_amount - v_transaction.amount)
        end,
        payment_status = case
          when p_status = 'pago' and o.paid_amount + v_transaction.amount >= o.total_amount then 'pago'
          when p_status = 'pago' then 'parcial'
          when greatest(0, o.paid_amount - v_transaction.amount) = 0 then 'pendente'
          else 'parcial'
        end
      where o.id = v_order.id;

      if v_transaction.payment_method = 'faturado' then
        select c.* into v_customer from public.customers c
        where c.id = v_order.customer_id and c.company_id = v_company_id for update;
        if found then
          update public.customers c set credit_used = case
            when p_status = 'pago' then greatest(0, coalesce(c.credit_used, 0) - v_transaction.amount)
            else coalesce(c.credit_used, 0) + v_transaction.amount
          end
          where c.id = v_customer.id;
        end if;
      end if;
    end if;
  end if;

  update public.financial_transactions f set
    status = p_status,
    paid_at = case when p_status = 'pago' then clock_timestamp() else null end
  where f.id = v_transaction.id
  returning f.* into v_transaction;

  return jsonb_build_object('status', 'UPDATED', 'transaction', to_jsonb(v_transaction));
end;
$$;

revoke all on function public.settle_financial_transaction(text,text,timestamptz) from public, anon;
grant execute on function public.settle_financial_transaction(text,text,timestamptz) to authenticated;

create or replace function public.operate_cash_register(
  p_operation text,
  p_amount numeric,
  p_description text default null,
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
  v_session public.cash_register_sessions%rowtype;
  v_transaction public.cash_register_transactions%rowtype;
  v_difference numeric;
begin
  if (select auth.uid()) is null or v_company_id is null
     or not private.current_user_can_access_path('/pos') then
    return jsonb_build_object('status', 'NOT_AUTHORIZED');
  end if;
  if p_operation not in ('open','close','suprimento','sangria') or p_amount is null or p_amount < 0 then
    return jsonb_build_object('status', 'INVALID_INPUT');
  end if;

  select p.* into v_actor from public.profiles p
  where p.auth_user_id = (select auth.uid()) and p.active = true and p.company_id = v_company_id
  order by p.id limit 1;
  if not found then return jsonb_build_object('status', 'NOT_AUTHORIZED'); end if;

  if p_operation = 'open' then
    if exists (select 1 from public.cash_register_sessions s where s.company_id = v_company_id and s.status = 'aberto') then
      return jsonb_build_object('status', 'CONFLICT');
    end if;
    insert into public.cash_register_sessions(company_id, opened_by, opening_balance, expected_cash, status, notes)
    values (v_company_id, v_actor.name, p_amount, p_amount, 'aberto', nullif(btrim(p_description), ''))
    returning * into v_session;
    insert into public.cash_register_transactions(session_id, type, amount, description, payment_method)
    values (v_session.id, 'abertura', p_amount, 'Abertura do Caixa', 'dinheiro') returning * into v_transaction;
    return jsonb_build_object('status', 'UPDATED', 'session', to_jsonb(v_session), 'transaction', to_jsonb(v_transaction));
  end if;

  select s.* into v_session from public.cash_register_sessions s
  where s.company_id = v_company_id and s.status = 'aberto' for update;
  if not found then return jsonb_build_object('status', 'NOT_FOUND'); end if;
  if p_expected_updated_at is not null and v_session.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('status', 'CONFLICT', 'session', to_jsonb(v_session));
  end if;

  if p_operation = 'close' then
    v_difference := p_amount - v_session.expected_cash;
    update public.cash_register_sessions s set
      status = 'fechado', closed_at = clock_timestamp(), actual_cash = p_amount,
      difference = v_difference, notes = coalesce(nullif(btrim(p_description), ''), s.notes)
    where s.id = v_session.id returning * into v_session;
    insert into public.cash_register_transactions(session_id, type, amount, description, payment_method)
    values (v_session.id, 'fechamento', p_amount, 'Fechamento do Caixa', 'dinheiro') returning * into v_transaction;
    if v_difference <> 0 then
      insert into public.financial_transactions(company_id, type, category, amount, description, payment_method, status, due_date, paid_at)
      values (v_company_id, case when v_difference >= 0 then 'receita' else 'despesa' end, 'Ajuste de Caixa', abs(v_difference),
        'Diferença de fechamento de caixa', 'dinheiro', 'pago', current_date, clock_timestamp());
    end if;
  else
    if p_amount <= 0 then return jsonb_build_object('status', 'INVALID_INPUT'); end if;
    if p_operation = 'sangria' and v_session.expected_cash - p_amount < 0 then
      return jsonb_build_object('status', 'INSUFFICIENT_CASH', 'session', to_jsonb(v_session));
    end if;
    update public.cash_register_sessions s set expected_cash = s.expected_cash + case when p_operation = 'suprimento' then p_amount else -p_amount end
    where s.id = v_session.id returning * into v_session;
    insert into public.cash_register_transactions(session_id, type, amount, description, payment_method)
    values (v_session.id, p_operation, p_amount, nullif(btrim(p_description), ''), 'dinheiro') returning * into v_transaction;
    insert into public.financial_transactions(company_id, type, category, amount, description, payment_method, status, due_date, paid_at)
    values (v_company_id, case when p_operation = 'suprimento' then 'receita' else 'despesa' end, 'Operações de Caixa', p_amount,
      upper(p_operation) || ': ' || coalesce(nullif(btrim(p_description), ''), 'Caixa'), 'dinheiro', 'pago', current_date, clock_timestamp());
  end if;

  return jsonb_build_object('status', 'UPDATED', 'session', to_jsonb(v_session), 'transaction', to_jsonb(v_transaction));
end;
$$;

revoke all on function public.operate_cash_register(text,numeric,text,timestamptz) from public, anon;
grant execute on function public.operate_cash_register(text,numeric,text,timestamptz) to authenticated;

create or replace function public.save_role_permissions(
  p_permissions jsonb,
  p_expected_versions jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id text := private.current_company_id();
  v_path text;
  v_roles text[];
  v_existing public.role_permissions%rowtype;
  v_saved jsonb;
begin
  if (select auth.uid()) is null or v_company_id is null
     or not private.current_user_can_access_path('/settings') then
    return jsonb_build_object('status', 'NOT_AUTHORIZED');
  end if;
  if p_permissions is null or jsonb_typeof(p_permissions) <> 'object' then
    return jsonb_build_object('status', 'INVALID_INPUT');
  end if;

  for v_path in select jsonb_object_keys(p_permissions) order by 1 loop
    if v_path !~ '^/[a-z0-9/_-]+$' then return jsonb_build_object('status', 'INVALID_INPUT'); end if;
    select coalesce(array_agg(value order by value), array[]::text[]) into v_roles
    from jsonb_array_elements_text(p_permissions -> v_path) value;
    if exists (select 1 from unnest(v_roles) role where role not in ('admin','gerente','financeiro','vendas','producao','estoque','arte_finalista')) then
      return jsonb_build_object('status', 'INVALID_INPUT');
    end if;

    select rp.* into v_existing from public.role_permissions rp
    where rp.company_id = v_company_id and rp.path = v_path for update;
    if found and p_expected_versions ? v_path
       and v_existing.updated_at is distinct from ((p_expected_versions ->> v_path)::timestamptz) then
      return jsonb_build_object('status', 'CONFLICT', 'permissions', (
        select coalesce(jsonb_agg(to_jsonb(rp) order by rp.path), '[]'::jsonb)
        from public.role_permissions rp where rp.company_id = v_company_id
      ));
    end if;

    insert into public.role_permissions(company_id, path, roles)
    values (v_company_id, v_path, v_roles)
    on conflict (company_id, path) do update set roles = excluded.roles
    where role_permissions.roles is distinct from excluded.roles;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(rp) order by rp.path), '[]'::jsonb) into v_saved
  from public.role_permissions rp where rp.company_id = v_company_id;
  return jsonb_build_object('status', 'UPDATED', 'permissions', v_saved);
end;
$$;

revoke all on function public.save_role_permissions(jsonb,jsonb) from public, anon;
grant execute on function public.save_role_permissions(jsonb,jsonb) to authenticated;

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
  elsif p_status = 'finalizado' then
    update public.shipments s set status = 'entregue', delivered_at = coalesce(s.delivered_at, clock_timestamp())
    where s.company_id = v_company_id and s.order_id = v_order.id and s.status <> 'entregue';
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

revoke all on function public.transition_order_status_phase4b(text,text,timestamptz) from public, anon;
grant execute on function public.transition_order_status_phase4b(text,text,timestamptz) to authenticated;

create or replace function public.record_order_payment_phase4b(
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
  v_company_id text := private.current_company_id();
  v_order public.orders%rowtype;
  v_financial public.financial_transactions%rowtype;
  v_customer public.customers%rowtype;
  v_session public.cash_register_sessions%rowtype;
  v_register public.cash_register_transactions%rowtype;
  v_payment numeric;
  v_new_paid numeric;
  v_due_days integer := 30;
  v_due_date date;
  v_paid_at timestamptz := coalesce(p_paid_at, clock_timestamp());
  v_description text;
begin
  if (select auth.uid()) is null or v_company_id is null
     or not private.current_user_can_access_path('/orders') then
    return jsonb_build_object('status', 'NOT_AUTHORIZED');
  end if;
  if p_amount is null or p_amount <= 0
     or p_method not in ('pix','cartao_credito','cartao_debito','boleto','dinheiro','faturado')
     or (p_payment_type is not null and p_payment_type not in ('adiantamento','parcial','saldo','total')) then
    return jsonb_build_object('status', 'INVALID_INPUT');
  end if;

  select o.* into v_order from public.orders o
  where o.id = p_order_id and o.company_id = v_company_id for update;
  if not found then return jsonb_build_object('status', 'NOT_FOUND'); end if;
  if p_expected_updated_at is not null and v_order.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('status', 'CONFLICT', 'order', to_jsonb(v_order));
  end if;

  v_payment := least(greatest(v_order.total_amount - v_order.paid_amount, 0), p_amount);
  if v_payment <= 0 then return jsonb_build_object('status', 'UNCHANGED', 'order', to_jsonb(v_order)); end if;
  v_new_paid := least(v_order.total_amount, v_order.paid_amount + v_payment);

  select c.* into v_customer from public.customers c
  where c.id = v_order.customer_id and c.company_id = v_company_id for update;
  if found and v_customer.billing_type = 'faturado' and v_customer.payment_terms_days is not null then
    v_due_days := v_customer.payment_terms_days;
  end if;
  v_due_date := case when p_method = 'faturado' then current_date + v_due_days else v_paid_at::date end;
  v_description := case coalesce(p_payment_type, case when v_new_paid >= v_order.total_amount then 'saldo' else 'parcial' end)
    when 'adiantamento' then 'Adiantamento'
    when 'parcial' then 'Pagamento parcial'
    when 'total' then 'Pagamento total'
    else 'Pagamento do saldo'
  end || ' do Pedido ' || v_order.number;
  if nullif(btrim(p_notes), '') is not null then v_description := v_description || ' - ' || btrim(p_notes); end if;

  update public.orders o set
    paid_amount = case when p_method = 'faturado' then o.paid_amount else v_new_paid end,
    payment_status = case when p_method = 'faturado' then 'pendente' when v_new_paid >= o.total_amount then 'pago' else 'parcial' end,
    status = case when o.status = 'aguardando_pagamento' and (p_method = 'faturado' or v_new_paid >= o.total_amount) then 'producao' else o.status end
  where o.id = v_order.id returning o.* into v_order;

  insert into public.financial_transactions(company_id, order_id, order_number, type, category, amount,
    description, payment_method, status, due_date, paid_at)
  values (v_company_id, v_order.id, v_order.number, 'receita', 'Vendas', v_payment,
    case when p_method = 'faturado' then 'Faturamento B2B - ' || v_description || ' (' || v_due_days || ' dias)' else v_description end,
    p_method, case when p_method = 'faturado' then 'pendente' else 'pago' end,
    v_due_date, case when p_method = 'faturado' then null else v_paid_at end)
  returning * into v_financial;

  if p_method = 'faturado' and v_customer.id is not null then
    update public.customers c set credit_used = coalesce(c.credit_used, 0) + v_payment
    where c.id = v_customer.id returning c.* into v_customer;
  elsif p_method <> 'faturado' then
    select s.* into v_session from public.cash_register_sessions s
    where s.company_id = v_company_id and s.status = 'aberto' for update;
    if found then
      insert into public.cash_register_transactions(session_id, type, amount, description, payment_method)
      values (v_session.id, 'venda', v_payment, 'Recebimento Pedido ' || v_order.number, p_method)
      returning * into v_register;
      if p_method = 'dinheiro' then
        update public.cash_register_sessions s set expected_cash = s.expected_cash + v_payment
        where s.id = v_session.id returning s.* into v_session;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'UPDATED', 'order', to_jsonb(v_order), 'financial', to_jsonb(v_financial),
    'customer', case when v_customer.id is not null then to_jsonb(v_customer) else null end,
    'session', case when v_session.id is not null then to_jsonb(v_session) else null end,
    'register_transaction', case when v_register.id is not null then to_jsonb(v_register) else null end
  );
end;
$$;

revoke all on function public.record_order_payment_phase4b(text,numeric,text,text,timestamptz,text,timestamptz) from public, anon;
grant execute on function public.record_order_payment_phase4b(text,numeric,text,text,timestamptz,text,timestamptz) to authenticated;

create or replace function public.save_order_with_items_phase4b(
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
  v_company_id text := private.current_company_id();
  v_actor public.profiles%rowtype;
  v_existing public.orders%rowtype;
  v_payload jsonb;
  v_order_id text := nullif(p_order ->> 'id', '');
  v_is_update boolean := false;
begin
  if (select auth.uid()) is null or v_company_id is null
     or not private.current_user_can_access_path('/orders') then
    return jsonb_build_object('result_status', 'NOT_AUTHORIZED');
  end if;
  if nullif(p_order ->> 'company_id', '') is distinct from v_company_id
     or v_order_id is null then
    return jsonb_build_object('result_status', 'INVALID_INPUT');
  end if;
  select p.* into v_actor from public.profiles p
  where p.auth_user_id = (select auth.uid()) and p.active = true and p.company_id = v_company_id
  order by p.id limit 1;
  if not found then return jsonb_build_object('result_status', 'NOT_AUTHORIZED'); end if;

  select o.* into v_existing from public.orders o
  where o.id = v_order_id and o.company_id = v_company_id for update;
  if found then
    v_is_update := true;
    if p_expected_updated_at is null or v_existing.updated_at is distinct from p_expected_updated_at then
      return jsonb_build_object('result_status', 'CONFLICT', 'order', to_jsonb(v_existing));
    end if;
  elsif p_expected_updated_at is not null then
    return jsonb_build_object('result_status', 'NOT_FOUND');
  end if;

  v_payload := public.save_order_with_items(p_order, p_items);
  insert into public.audit_logs(company_id, actor_user_id, actor_profile_id, actor_name, actor_role,
    action, entity_type, entity_id, module, old_values, new_values, metadata)
  values (v_company_id, (select auth.uid()), v_actor.id, v_actor.name, v_actor.role,
    case when v_is_update then 'order.updated' else 'order.created' end, 'orders', v_order_id, 'orders',
    case when v_is_update then jsonb_build_object('status', v_existing.status, 'total_amount', v_existing.total_amount, 'updated_at', v_existing.updated_at) else '{}'::jsonb end,
    jsonb_build_object('status', v_payload -> 'order' -> 'status', 'total_amount', v_payload -> 'order' -> 'total_amount', 'updated_at', v_payload -> 'order' -> 'updated_at'),
    jsonb_build_object('order_number', v_payload -> 'order' -> 'number', 'item_count', jsonb_array_length(coalesce(v_payload -> 'items', '[]'::jsonb)), 'source', 'phase4b_explicit_command'));
  return jsonb_build_object('result_status', 'UPDATED', 'payload', v_payload);
end;
$$;

revoke all on function public.save_order_with_items_phase4b(jsonb,jsonb,timestamptz) from public, anon;
grant execute on function public.save_order_with_items_phase4b(jsonb,jsonb,timestamptz) to authenticated;

create or replace function public.save_quote_with_items_phase4b(
  p_quote jsonb,
  p_items jsonb default '[]'::jsonb,
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
  v_existing public.quotes%rowtype;
  v_payload jsonb;
  v_quote_id text := nullif(p_quote ->> 'id', '');
  v_is_update boolean := false;
begin
  if (select auth.uid()) is null or v_company_id is null
     or not private.current_user_can_access_path('/quotes') then
    return jsonb_build_object('result_status', 'NOT_AUTHORIZED');
  end if;
  if nullif(p_quote ->> 'company_id', '') is distinct from v_company_id
     or v_quote_id is null then
    return jsonb_build_object('result_status', 'INVALID_INPUT');
  end if;
  select p.* into v_actor from public.profiles p
  where p.auth_user_id = (select auth.uid()) and p.active = true and p.company_id = v_company_id
  order by p.id limit 1;
  if not found then return jsonb_build_object('result_status', 'NOT_AUTHORIZED'); end if;

  select q.* into v_existing from public.quotes q
  where q.id = v_quote_id and q.company_id = v_company_id for update;
  if found then
    v_is_update := true;
    if p_expected_updated_at is null or v_existing.updated_at is distinct from p_expected_updated_at then
      return jsonb_build_object('result_status', 'CONFLICT', 'quote', to_jsonb(v_existing));
    end if;
  elsif p_expected_updated_at is not null then
    return jsonb_build_object('result_status', 'NOT_FOUND');
  end if;

  v_payload := public.save_quote_with_items(p_quote, p_items);
  insert into public.audit_logs(company_id, actor_user_id, actor_profile_id, actor_name, actor_role,
    action, entity_type, entity_id, module, old_values, new_values, metadata)
  values (v_company_id, (select auth.uid()), v_actor.id, v_actor.name, v_actor.role,
    case when v_is_update then 'quote.updated' else 'quote.created' end, 'quotes', v_quote_id, 'quotes',
    case when v_is_update then jsonb_build_object('status', v_existing.status, 'total_amount', v_existing.total_amount, 'updated_at', v_existing.updated_at) else '{}'::jsonb end,
    jsonb_build_object('status', v_payload -> 'quote' -> 'status', 'total_amount', v_payload -> 'quote' -> 'total_amount', 'updated_at', v_payload -> 'quote' -> 'updated_at'),
    jsonb_build_object('quote_number', v_payload -> 'quote' -> 'number', 'item_count', jsonb_array_length(coalesce(v_payload -> 'items', '[]'::jsonb)), 'source', 'phase4b_explicit_command'));
  return jsonb_build_object('result_status', 'UPDATED', 'payload', v_payload);
end;
$$;

revoke all on function public.save_quote_with_items_phase4b(jsonb,jsonb,timestamptz) from public, anon;
grant execute on function public.save_quote_with_items_phase4b(jsonb,jsonb,timestamptz) to authenticated;

-- Prevent browser callers from bypassing the concurrency gates through the
-- legacy aggregate functions. The Phase 4B wrappers remain their only caller.
revoke all on function public.save_order_with_items(jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.save_quote_with_items(jsonb,jsonb) from public, anon, authenticated;
