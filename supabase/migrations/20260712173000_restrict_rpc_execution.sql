-- Functions are private by default; only required entry points are callable.
do $$
declare function_signature regprocedure;
begin
  for function_signature in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon', function_signature);
  end loop;
end;
$$;

grant execute on function public.ensure_store_customer_account(text, text, text, text, text, text, text, date, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.save_quote_with_items(jsonb, jsonb) to authenticated;

do $$
begin
  if to_regprocedure('public.save_order_with_items(jsonb,jsonb)') is not null then
    execute 'grant execute on function public.save_order_with_items(jsonb,jsonb) to authenticated';
  end if;
  if to_regprocedure('public.approve_quote_and_create_order(text)') is not null then
    execute 'grant execute on function public.approve_quote_and_create_order(text) to authenticated';
  end if;
end;
$$;
