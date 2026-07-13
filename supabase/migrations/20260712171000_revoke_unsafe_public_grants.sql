-- Base business tables are never public API surfaces.
revoke all on table
  public.cash_register_sessions, public.cash_register_transactions, public.categories,
  public.companies, public.customers, public.financial_transactions, public.order_items,
  public.orders, public.pickup_points, public.production_queue, public.products,
  public.quote_items, public.quotes, public.role_permissions, public.settings,
  public.shipments, public.stock_movements, public.store_banners, public.suppliers
from anon;

revoke all on all sequences in schema public from anon;

grant select, insert, update, delete on table
  public.cash_register_sessions, public.cash_register_transactions, public.categories,
  public.companies, public.customers, public.financial_transactions, public.order_items,
  public.orders, public.pickup_points, public.production_queue, public.products,
  public.quote_items, public.quotes, public.role_permissions, public.settings,
  public.shipments, public.stock_movements, public.store_banners, public.suppliers
to authenticated;

grant usage, select on all sequences in schema public to authenticated;
