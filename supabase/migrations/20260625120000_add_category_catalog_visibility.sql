alter table public.categories
  add column if not exists show_in_catalog boolean default true;

update public.categories
set show_in_catalog = true
where show_in_catalog is null;
