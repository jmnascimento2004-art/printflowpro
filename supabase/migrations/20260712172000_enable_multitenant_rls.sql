-- Restore tenant isolation lost through remote schema drift.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cash_register_sessions', 'categories', 'customers', 'financial_transactions',
    'orders', 'pickup_points', 'production_queue', 'products', 'quotes',
    'role_permissions', 'settings', 'shipments', 'stock_movements', 'store_banners', 'suppliers'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', 'tenant_' || table_name || '_select', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (company_id = private.current_company_id())', 'tenant_' || table_name || '_select', table_name);
    execute format('drop policy if exists %I on public.%I', 'tenant_' || table_name || '_insert', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (company_id = private.current_company_id())', 'tenant_' || table_name || '_insert', table_name);
    execute format('drop policy if exists %I on public.%I', 'tenant_' || table_name || '_update', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (company_id = private.current_company_id()) with check (company_id = private.current_company_id())', 'tenant_' || table_name || '_update', table_name);
    execute format('drop policy if exists %I on public.%I', 'tenant_' || table_name || '_delete', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (company_id = private.current_company_id())', 'tenant_' || table_name || '_delete', table_name);
  end loop;
end;
$$;

alter table public.companies enable row level security;
drop policy if exists tenant_companies_select on public.companies;
create policy tenant_companies_select on public.companies for select to authenticated
using (id = private.current_company_id());
drop policy if exists tenant_companies_update on public.companies;
create policy tenant_companies_update on public.companies for update to authenticated
using (id = private.current_company_id() and private.current_user_role() in ('admin', 'gerente'))
with check (id = private.current_company_id() and private.current_user_role() in ('admin', 'gerente'));

alter table public.quote_items enable row level security;
alter table public.order_items enable row level security;
alter table public.cash_register_transactions enable row level security;

do $$
declare
  operation text;
  parent_table text;
  child_table text;
  parent_key text;
  policy_clause text;
begin
  for child_table, parent_table, parent_key in
    select * from (values
      ('quote_items', 'quotes', 'quote_id'),
      ('order_items', 'orders', 'order_id'),
      ('cash_register_transactions', 'cash_register_sessions', 'session_id')
    ) relations(child_table, parent_table, parent_key)
  loop
    foreach operation in array array['select', 'insert', 'update', 'delete']
    loop
      policy_clause := format(
        'exists (select 1 from public.%I parent where parent.id = %I.%I and parent.company_id = private.current_company_id())',
        parent_table, child_table, parent_key
      );
      execute format('drop policy if exists %I on public.%I', 'tenant_' || child_table || '_' || operation, child_table);
      if operation = 'insert' then
        execute format('create policy %I on public.%I for insert to authenticated with check (%s)', 'tenant_' || child_table || '_insert', child_table, policy_clause);
      elsif operation = 'update' then
        execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', 'tenant_' || child_table || '_update', child_table, policy_clause, policy_clause);
      else
        execute format('create policy %I on public.%I for %s to authenticated using (%s)', 'tenant_' || child_table || '_' || operation, child_table, operation, policy_clause);
      end if;
    end loop;
  end loop;
end;
$$;

-- Preserve authenticated store customers reading only their own records.
drop policy if exists store_orders_self_select on public.orders;
create policy store_orders_self_select on public.orders for select to authenticated using (
  exists (select 1 from public.store_customer_accounts a where a.customer_id = orders.customer_id and a.company_id = orders.company_id and a.auth_user_id = auth.uid() and a.status = 'active')
);
drop policy if exists store_order_items_self_select on public.order_items;
create policy store_order_items_self_select on public.order_items for select to authenticated using (
  exists (select 1 from public.orders o join public.store_customer_accounts a on a.customer_id = o.customer_id and a.company_id = o.company_id where o.id = order_items.order_id and a.auth_user_id = auth.uid() and a.status = 'active')
);
drop policy if exists store_quotes_self_select on public.quotes;
create policy store_quotes_self_select on public.quotes for select to authenticated using (
  exists (select 1 from public.store_customer_accounts a where a.customer_id = quotes.customer_id and a.company_id = quotes.company_id and a.auth_user_id = auth.uid() and a.status = 'active')
);
drop policy if exists store_quote_items_self_select on public.quote_items;
create policy store_quote_items_self_select on public.quote_items for select to authenticated using (
  exists (select 1 from public.quotes q join public.store_customer_accounts a on a.customer_id = q.customer_id and a.company_id = q.company_id where q.id = quote_items.quote_id and a.auth_user_id = auth.uid() and a.status = 'active')
);

select pg_notify('pgrst', 'reload schema');
