alter table public.quotes
  add column if not exists delivery_origin_address text;

alter table public.orders
  add column if not exists delivery_origin_address text;
