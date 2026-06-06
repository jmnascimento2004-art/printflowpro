-- PRINTFLOWPRO - allow public catalog checkout to create quotes
-- Safe additive migration. Allows anon INSERT only, not public quote reading.

grant insert on public.quotes to anon;
grant insert on public.quote_items to anon;

drop policy if exists "public_store_quotes_insert" on public.quotes;
create policy "public_store_quotes_insert"
on public.quotes for insert
to anon
with check (
  status = 'pendente'
  and customer_id = 'cust-store-temp'
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
      and q.customer_id = 'cust-store-temp'
      and q.status = 'pendente'
  )
);
