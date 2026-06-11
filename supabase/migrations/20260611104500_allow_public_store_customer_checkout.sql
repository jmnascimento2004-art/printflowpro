-- PRINTFLOWPRO - allow public catalog checkout to create web customers
-- Safe additive migration. Keeps public access insert-only and scoped to catalog records.

grant insert on public.customers to anon;

drop policy if exists "public_store_customers_insert" on public.customers;
create policy "public_store_customers_insert"
on public.customers for insert
to anon
with check (
  id like 'cust-web-%'
  and 'Catalogo Online' = any(tags)
  and exists (
    select 1
    from public.companies c
    where c.id = company_id
  )
);

drop policy if exists "public_store_quotes_insert" on public.quotes;
create policy "public_store_quotes_insert"
on public.quotes for insert
to anon
with check (
  status = 'pendente'
  and customer_id like 'cust-web-%'
  and exists (
    select 1
    from public.companies c
    where c.id = company_id
  )
);

drop policy if exists "public_store_quote_items_insert" on public.quote_items;
create policy "public_store_quote_items_insert"
on public.quote_items for insert
to anon
with check (
  exists (
    select 1
    from public.quotes q
    where q.id = quote_id
      and q.customer_id like 'cust-web-%'
      and q.status = 'pendente'
  )
);
