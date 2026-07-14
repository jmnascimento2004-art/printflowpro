-- Recovery seguro da migration 20260712171000_revoke_unsafe_public_grants.sql
-- Objetivo: restaurar somente grants necessários ao dashboard autenticado.
-- Pré-condições: RLS/policies aprovadas; usar somente diante de permission denied.
-- service_role não é reduzido aqui. Não altera RLS nem dados.
-- Rotas: CRM=customers; catálogo=categories/products; comercial=quotes/orders e
-- itens; produção=production_queue; financeiro/caixa=financial_transactions e
-- cash_register_*; expedição/estoque=shipments/stock_movements; configurações=
-- companies/settings/pickup_points/store_banners/role_permissions/suppliers.
-- Validar antes/depois em information_schema.role_table_grants e
-- information_schema.role_usage_grants. Proibido ampliar papéis/defaults.

revoke all on table public.cash_register_sessions,
  public.cash_register_transactions, public.categories, public.companies,
  public.customers, public.financial_transactions, public.order_items,
  public.orders, public.pickup_points, public.production_queue, public.products,
  public.quote_items, public.quotes, public.role_permissions, public.settings,
  public.shipments, public.stock_movements, public.store_banners, public.suppliers
from anon;
revoke all on sequence public.quotes_number_seq from anon;

grant select on table public.cash_register_sessions,
  public.cash_register_transactions, public.categories, public.companies,
  public.customers, public.financial_transactions, public.order_items,
  public.orders, public.pickup_points, public.production_queue, public.products,
  public.quote_items, public.quotes, public.role_permissions, public.settings,
  public.shipments, public.stock_movements, public.store_banners, public.suppliers
to authenticated;

grant insert on table public.cash_register_sessions,
  public.cash_register_transactions, public.categories, public.customers,
  public.financial_transactions, public.order_items, public.orders,
  public.pickup_points, public.production_queue, public.products,
  public.quote_items, public.quotes, public.role_permissions, public.settings,
  public.shipments, public.stock_movements, public.store_banners, public.suppliers
to authenticated;

grant update on table public.cash_register_sessions,
  public.cash_register_transactions, public.categories, public.companies,
  public.customers, public.financial_transactions, public.order_items,
  public.orders, public.pickup_points, public.production_queue, public.products,
  public.quote_items, public.quotes, public.role_permissions, public.settings,
  public.shipments, public.stock_movements, public.store_banners, public.suppliers
to authenticated;

grant delete on table public.cash_register_sessions,
  public.cash_register_transactions, public.categories, public.customers,
  public.financial_transactions, public.order_items, public.orders,
  public.pickup_points, public.production_queue, public.products,
  public.quote_items, public.quotes, public.role_permissions, public.shipments,
  public.stock_movements, public.store_banners, public.suppliers
to authenticated;

grant usage, select on sequence public.quotes_number_seq to authenticated;

select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
  and table_name in ('cash_register_sessions','cash_register_transactions',
  'categories','companies','customers','financial_transactions','order_items',
  'orders','pickup_points','production_queue','products','quote_items','quotes',
  'role_permissions','settings','shipments','stock_movements','store_banners','suppliers')
order by grantee, table_name, privilege_type;
