-- Keeps the public catalog identity available after a customer logs in.
-- Supabase switches the browser role from anon to authenticated once there is
-- a session, so public store reads must explicitly allow both roles.

grant select on public.companies, public.settings, public.categories, public.products, public.pickup_points, public.store_banners
to anon, authenticated;

drop policy if exists "public_store_companies_select" on public.companies;
create policy "public_store_companies_select"
on public.companies for select
to anon, authenticated
using (true);

drop policy if exists "public_store_settings_select" on public.settings;
create policy "public_store_settings_select"
on public.settings for select
to anon, authenticated
using (true);

drop policy if exists "public_store_categories_select" on public.categories;
create policy "public_store_categories_select"
on public.categories for select
to anon, authenticated
using (true);

drop policy if exists "public_store_products_select" on public.products;
create policy "public_store_products_select"
on public.products for select
to anon, authenticated
using (active = true);

drop policy if exists "public_store_pickup_points_select" on public.pickup_points;
create policy "public_store_pickup_points_select"
on public.pickup_points for select
to anon, authenticated
using (active = true);

drop policy if exists "public_store_banners_select" on public.store_banners;
create policy "public_store_banners_select"
on public.store_banners for select
to anon, authenticated
using (true);
