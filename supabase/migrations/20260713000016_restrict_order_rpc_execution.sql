-- Remove legacy default grants retained by CREATE OR REPLACE FUNCTION.
revoke all on function public.save_order_with_items(jsonb, jsonb) from public, anon;
grant execute on function public.save_order_with_items(jsonb, jsonb) to authenticated;

select pg_notify('pgrst', 'reload schema');
