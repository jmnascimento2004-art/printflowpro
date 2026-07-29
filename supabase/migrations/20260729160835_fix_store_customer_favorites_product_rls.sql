create or replace function private.can_store_customer_manage_favorite(
  p_company_id text,
  p_customer_id text,
  p_product_id text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.store_customer_accounts as account
    join public.products as product
      on product.id = p_product_id
     and product.company_id = p_company_id
     and product.active = true
     and coalesce(product.catalog_active, true) = true
    where account.customer_id = p_customer_id
      and account.company_id = p_company_id
      and account.auth_user_id = (select auth.uid())
      and account.status = 'active'
  )
$$;

revoke all on function private.can_store_customer_manage_favorite(text, text, text) from public;
revoke all on function private.can_store_customer_manage_favorite(text, text, text) from anon;
grant execute on function private.can_store_customer_manage_favorite(text, text, text) to authenticated;

drop policy if exists "store_favorites_self_insert" on public.store_customer_favorites;
create policy "store_favorites_self_insert"
on public.store_customer_favorites for insert
to authenticated
with check (
  (select private.can_store_customer_manage_favorite(company_id, customer_id, product_id))
);
