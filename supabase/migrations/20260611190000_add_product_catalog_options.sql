-- Adds independent catalog visibility and configurable product options.
-- Safe additive migration: existing products remain visible in the catalog.

alter table public.products
  add column if not exists catalog_active boolean default true,
  add column if not exists variant_options jsonb default '[]'::jsonb,
  add column if not exists color_options jsonb default '[]'::jsonb;

update public.products
set
  active = true,
  catalog_active = coalesce(catalog_active, true),
  variant_options = coalesce(variant_options, '[]'::jsonb),
  color_options = coalesce(color_options, '[]'::jsonb);
