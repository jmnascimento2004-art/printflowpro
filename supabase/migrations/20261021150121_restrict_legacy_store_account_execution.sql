-- Apply only after the server caller is READY in Production. Old browser
-- bundles must reload; they must never retain a direct tenant-selection path.
revoke all on function public.ensure_store_customer_account(
  text, text, text, text, text, text, text, date, text, text, text, boolean, boolean
) from public, anon, authenticated;

select pg_catalog.pg_notify('pgrst', 'reload schema');
