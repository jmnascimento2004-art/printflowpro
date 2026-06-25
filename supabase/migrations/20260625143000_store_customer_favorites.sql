-- PRINTFLOWPRO - Public store customer favorites
-- Persists product favorites for authenticated store customers only.

create table if not exists public.store_customer_favorites (
  id text primary key default (gen_random_uuid()::text),
  company_id text not null references public.companies(id) on delete cascade,
  customer_id text not null references public.customers(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (company_id, customer_id, product_id)
);

create index if not exists idx_store_customer_favorites_customer
  on public.store_customer_favorites(company_id, customer_id, created_at desc);

create index if not exists idx_store_customer_favorites_product
  on public.store_customer_favorites(company_id, product_id);

alter table public.store_customer_favorites enable row level security;

grant select, insert, delete on public.store_customer_favorites to authenticated;

drop policy if exists "store_favorites_self_select" on public.store_customer_favorites;
create policy "store_favorites_self_select"
on public.store_customer_favorites for select
to authenticated
using (
  exists (
    select 1 from public.store_customer_accounts a
    where a.customer_id = store_customer_favorites.customer_id
      and a.company_id = store_customer_favorites.company_id
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
);

drop policy if exists "store_favorites_self_insert" on public.store_customer_favorites;
create policy "store_favorites_self_insert"
on public.store_customer_favorites for insert
to authenticated
with check (
  exists (
    select 1 from public.store_customer_accounts a
    where a.customer_id = store_customer_favorites.customer_id
      and a.company_id = store_customer_favorites.company_id
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
  and exists (
    select 1 from public.products p
    where p.id = store_customer_favorites.product_id
      and p.company_id = store_customer_favorites.company_id
      and p.active = true
      and coalesce(p.catalog_active, true) = true
  )
);

drop policy if exists "store_favorites_self_delete" on public.store_customer_favorites;
create policy "store_favorites_self_delete"
on public.store_customer_favorites for delete
to authenticated
using (
  exists (
    select 1 from public.store_customer_accounts a
    where a.customer_id = store_customer_favorites.customer_id
      and a.company_id = store_customer_favorites.company_id
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
);
