-- PRINTFLOWPRO - Supabase Auth + tenant scoped RLS
-- Safe to run after the existing schema. This migration does not drop tables or data.

create schema if not exists private;

alter table public.profiles
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists idx_profiles_auth_user_id
  on public.profiles(auth_user_id)
  where auth_user_id is not null;

create index if not exists idx_profiles_auth_company
  on public.profiles(auth_user_id, company_id)
  where auth_user_id is not null;

create or replace function private.current_company_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.company_id
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
    and p.active = true
  limit 1
$$;

create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
    and p.active = true
  limit 1
$$;

revoke all on function private.current_company_id() from public;
revoke all on function private.current_user_role() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_company_id() to authenticated;
grant execute on function private.current_user_role() to authenticated;

alter table public.companies enable row level security;
alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.production_queue enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.stock_movements enable row level security;
alter table public.shipments enable row level security;
alter table public.pickup_points enable row level security;
alter table public.store_banners enable row level security;
alter table public.cash_register_sessions enable row level security;
alter table public.cash_register_transactions enable row level security;

grant select on public.companies, public.settings, public.categories, public.products, public.pickup_points, public.store_banners to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

drop policy if exists "public_store_companies_select" on public.companies;
create policy "public_store_companies_select"
on public.companies for select
to anon
using (true);

drop policy if exists "public_store_settings_select" on public.settings;
create policy "public_store_settings_select"
on public.settings for select
to anon
using (true);

drop policy if exists "public_store_categories_select" on public.categories;
create policy "public_store_categories_select"
on public.categories for select
to anon
using (true);

drop policy if exists "public_store_products_select" on public.products;
create policy "public_store_products_select"
on public.products for select
to anon
using (active = true);

drop policy if exists "public_store_pickup_points_select" on public.pickup_points;
create policy "public_store_pickup_points_select"
on public.pickup_points for select
to anon
using (active = true);

drop policy if exists "public_store_banners_select" on public.store_banners;
create policy "public_store_banners_select"
on public.store_banners for select
to anon
using (true);

drop policy if exists "tenant_companies_select" on public.companies;
create policy "tenant_companies_select"
on public.companies for select
to authenticated
using (id = private.current_company_id());

drop policy if exists "tenant_companies_update" on public.companies;
create policy "tenant_companies_update"
on public.companies for update
to authenticated
using (id = private.current_company_id() and private.current_user_role() in ('admin', 'gerente'))
with check (id = private.current_company_id() and private.current_user_role() in ('admin', 'gerente'));

drop policy if exists "tenant_profiles_select" on public.profiles;
create policy "tenant_profiles_select"
on public.profiles for select
to authenticated
using (
  company_id = private.current_company_id()
  or auth_user_id = (select auth.uid())
  or (auth_user_id is null and email = ((select auth.jwt()) ->> 'email'))
);

drop policy if exists "tenant_profiles_claim_auth_user" on public.profiles;
create policy "tenant_profiles_claim_auth_user"
on public.profiles for update
to authenticated
using (
  auth_user_id is null
  and email = ((select auth.jwt()) ->> 'email')
)
with check (
  auth_user_id = (select auth.uid())
  and email = ((select auth.jwt()) ->> 'email')
);

drop policy if exists "tenant_profiles_insert" on public.profiles;
create policy "tenant_profiles_insert"
on public.profiles for insert
to authenticated
with check (company_id = private.current_company_id() and private.current_user_role() in ('admin', 'gerente'));

drop policy if exists "tenant_profiles_update" on public.profiles;
create policy "tenant_profiles_update"
on public.profiles for update
to authenticated
using (
  company_id = private.current_company_id()
  and (auth_user_id = (select auth.uid()) or private.current_user_role() in ('admin', 'gerente'))
)
with check (
  company_id = private.current_company_id()
  and (auth_user_id = (select auth.uid()) or private.current_user_role() in ('admin', 'gerente'))
);

drop policy if exists "tenant_profiles_delete" on public.profiles;
create policy "tenant_profiles_delete"
on public.profiles for delete
to authenticated
using (
  company_id = private.current_company_id()
  and private.current_user_role() in ('admin', 'gerente')
  and coalesce(auth_user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> (select auth.uid())
);

drop policy if exists "tenant_settings_all" on public.settings;
create policy "tenant_settings_all"
on public.settings for all
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop policy if exists "tenant_role_permissions_all" on public.role_permissions;
create policy "tenant_role_permissions_all"
on public.role_permissions for all
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop policy if exists "tenant_customers_all" on public.customers;
create policy "tenant_customers_all"
on public.customers for all
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop policy if exists "tenant_suppliers_all" on public.suppliers;
create policy "tenant_suppliers_all"
on public.suppliers for all
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop policy if exists "tenant_categories_all" on public.categories;
create policy "tenant_categories_all"
on public.categories for all
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop policy if exists "tenant_products_all" on public.products;
create policy "tenant_products_all"
on public.products for all
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop policy if exists "tenant_quotes_all" on public.quotes;
create policy "tenant_quotes_all"
on public.quotes for all
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop policy if exists "tenant_orders_all" on public.orders;
create policy "tenant_orders_all"
on public.orders for all
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop policy if exists "tenant_production_all" on public.production_queue;
create policy "tenant_production_all"
on public.production_queue for all
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop policy if exists "tenant_financial_all" on public.financial_transactions;
create policy "tenant_financial_all"
on public.financial_transactions for all
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop policy if exists "tenant_stock_movements_all" on public.stock_movements;
create policy "tenant_stock_movements_all"
on public.stock_movements for all
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop policy if exists "tenant_shipments_all" on public.shipments;
create policy "tenant_shipments_all"
on public.shipments for all
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop policy if exists "tenant_pickup_points_all" on public.pickup_points;
create policy "tenant_pickup_points_all"
on public.pickup_points for all
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop policy if exists "tenant_store_banners_all" on public.store_banners;
create policy "tenant_store_banners_all"
on public.store_banners for all
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop policy if exists "tenant_cash_sessions_all" on public.cash_register_sessions;
create policy "tenant_cash_sessions_all"
on public.cash_register_sessions for all
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop policy if exists "tenant_quote_items_all" on public.quote_items;
create policy "tenant_quote_items_all"
on public.quote_items for all
to authenticated
using (
  exists (
    select 1 from public.quotes q
    where q.id = quote_id
      and q.company_id = private.current_company_id()
  )
)
with check (
  exists (
    select 1 from public.quotes q
    where q.id = quote_id
      and q.company_id = private.current_company_id()
  )
);

drop policy if exists "tenant_order_items_all" on public.order_items;
create policy "tenant_order_items_all"
on public.order_items for all
to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_id
      and o.company_id = private.current_company_id()
  )
)
with check (
  exists (
    select 1 from public.orders o
    where o.id = order_id
      and o.company_id = private.current_company_id()
  )
);

drop policy if exists "tenant_cash_transactions_all" on public.cash_register_transactions;
create policy "tenant_cash_transactions_all"
on public.cash_register_transactions for all
to authenticated
using (
  exists (
    select 1 from public.cash_register_sessions s
    where s.id = session_id
      and s.company_id = private.current_company_id()
  )
)
with check (
  exists (
    select 1 from public.cash_register_sessions s
    where s.id = session_id
      and s.company_id = private.current_company_id()
  )
);
