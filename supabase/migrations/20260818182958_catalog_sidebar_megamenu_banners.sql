-- PRINTFLOWPRO - configurable catalog navigation, mega menu and commercial banners.
-- Additive only: existing banners remain hero slides and existing categories remain
-- regular catalog navigation entries.

alter table public.categories
  add column if not exists catalog_featured boolean not null default false,
  add column if not exists catalog_featured_title text,
  add column if not exists catalog_featured_sort_order integer not null default 0,
  add column if not exists catalog_mega_menu_enabled boolean not null default false,
  add column if not exists catalog_mega_menu_banner_enabled boolean not null default false,
  add column if not exists catalog_mega_menu_banner_image_url text,
  add column if not exists catalog_mega_menu_banner_link text,
  add column if not exists catalog_mega_menu_banner_alt text,
  add column if not exists catalog_mega_menu_banner_new_tab boolean not null default false;

alter table public.store_banners
  add column if not exists placement text not null default 'hero',
  add column if not exists mobile_image_url text,
  add column if not exists alt_text text,
  add column if not exists active boolean not null default true,
  add column if not exists sort_order integer not null default 0,
  add column if not exists open_in_new_tab boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'categories_catalog_featured_sort_order_check'
      and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_catalog_featured_sort_order_check
      check (catalog_featured_sort_order >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'store_banners_placement_check'
      and conrelid = 'public.store_banners'::regclass
  ) then
    alter table public.store_banners
      add constraint store_banners_placement_check
      check (placement in ('hero', 'catalog'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'store_banners_sort_order_check'
      and conrelid = 'public.store_banners'::regclass
  ) then
    alter table public.store_banners
      add constraint store_banners_sort_order_check
      check (sort_order >= 0);
  end if;
end;
$$;

create index if not exists idx_categories_company_catalog_featured
  on public.categories (company_id, catalog_featured_sort_order, name)
  where catalog_featured = true and show_in_catalog is not false;

create index if not exists idx_store_banners_company_placement_active_sort
  on public.store_banners (company_id, placement, active, sort_order, created_at);

select pg_notify('pgrst', 'reload schema');
