begin;
select plan(31);

select has_column('public', 'products', 'slug', 'products expose a canonical slug');
select col_not_null('public', 'products', 'slug', 'canonical slug is required');
select has_index('public', 'products', 'products_company_slug_key', 'tenant and slug are unique');
select has_trigger('public', 'products', 'ensure_product_slug', 'slug allocation runs at the database boundary');
select has_trigger('public', 'products', 'audit_product_slug_change', 'manual slug changes are audited');
select has_function('private', 'normalize_product_slug', array['text']);
select function_privs_are('private', 'normalize_product_slug', array['text'], 'authenticated', array[]::text[]);
select has_function('private', 'allocate_product_slug', array['text','text','text']);
select function_privs_are('private', 'allocate_product_slug', array['text','text','text'], 'authenticated', array[]::text[]);
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'ensure_product_slug'), 'slug trigger is SECURITY DEFINER');
select function_privs_are('private', 'ensure_product_slug', array[]::text[], 'authenticated', array[]::text[]);
select ok(exists (select 1 from pg_constraint where conrelid = 'public.products'::regclass and conname = 'products_slug_format_check'), 'slug format is constrained');
select ok(exists (
  select 1
  from pg_policies
  where schemaname = 'public'
    and tablename = 'products'
    and policyname = 'public_store_products_select'
    and qual ilike '%active = true%'
    and qual ilike '%catalog_active = true%'
), 'public product policy requires both active and catalog publication');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('55000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'permalink-a@example.test', '', now(), '{}'::jsonb, '{"name":"Admin A","company_name":"Permalink A"}'::jsonb, now(), now()),
  ('55000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'permalink-b@example.test', '', now(), '{}'::jsonb, '{"name":"Admin B","company_name":"Permalink B"}'::jsonb, now(), now());

insert into public.products(id, company_id, name, pricing_type, base_cost, sales_price, active, catalog_active)
values
  ('permalink-product-a1', (select company_id from public.profiles where auth_user_id = '55000000-0000-0000-0000-000000000001'), 'Cartão Ágil', 'unidade', 1, 2, true, true),
  ('permalink-product-a2', (select company_id from public.profiles where auth_user_id = '55000000-0000-0000-0000-000000000001'), 'Cartão Ágil', 'unidade', 1, 2, true, true),
  ('permalink-product-b1', (select company_id from public.profiles where auth_user_id = '55000000-0000-0000-0000-000000000002'), 'Cartão Ágil', 'unidade', 1, 2, true, true),
  ('permalink-product-b2', (select company_id from public.profiles where auth_user_id = '55000000-0000-0000-0000-000000000002'), 'Produto reservado', 'unidade', 1, 2, true, false);

select is((select slug from public.products where id = 'permalink-product-a1'), 'cartao-agil', 'Portuguese accents normalize deterministically');
select is((select slug from public.products where id = 'permalink-product-a2'), 'cartao-agil-2', 'same-tenant collision receives the next suffix');
select is((select slug from public.products where id = 'permalink-product-b1'), 'cartao-agil', 'different tenants may share the same slug');

update public.products set name = 'Nome comercial novo' where id = 'permalink-product-a1';
select is((select slug from public.products where id = 'permalink-product-a1'), 'cartao-agil', 'renaming preserves the public permalink');

select set_config('request.jwt.claims', '{"sub":"55000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.products(id, company_id, name, pricing_type, base_cost, sales_price, active, catalog_active)
    values ('permalink-product-a3', (select company_id from public.profiles where auth_user_id = '55000000-0000-0000-0000-000000000001'), 'Inserção autenticada', 'unidade', 1, 2, true, true)$$,
  'authenticated tenant insert can allocate a private slug through the trigger'
);
select is((select slug from public.products where id = 'permalink-product-a3'), 'insercao-autenticada', 'authenticated insert receives its slug');
update public.products set slug = ' Campanha Especial! ' where id = 'permalink-product-a1';
select is((select slug from public.products where id = 'permalink-product-a1'), 'campanha-especial', 'explicit slug edits are normalized');

update public.products set slug = 'campanha-especial' where id = 'permalink-product-a2';
select is((select slug from public.products where id = 'permalink-product-a2'), 'campanha-especial-2', 'explicit collisions are resolved deterministically');
select is((select count(*)::integer from public.audit_logs where entity_id = 'permalink-product-a1' and action = 'product.slug_changed'), 1, 'slug change creates one dedicated event');
select is((select old_values ->> 'slug' from public.audit_logs where entity_id = 'permalink-product-a1' and action = 'product.slug_changed'), 'cartao-agil', 'audit stores the previous slug');
select is((select new_values ->> 'slug' from public.audit_logs where entity_id = 'permalink-product-a1' and action = 'product.slug_changed'), 'campanha-especial', 'audit stores the new slug');
select ok((select old_values = jsonb_build_object('slug', 'cartao-agil') and new_values = jsonb_build_object('slug', 'campanha-especial') from public.audit_logs where entity_id = 'permalink-product-a1' and action = 'product.slug_changed'), 'slug audit exposes no unrelated product data');

update public.products set slug = 'cross-tenant-attempt' where id = 'permalink-product-b1';
select is((select slug from public.products where id = 'permalink-product-b1'), 'cartao-agil', 'cross-tenant slug update changes no row');
select is((select count(*)::integer from public.audit_logs where entity_id = 'permalink-product-b1' and action = 'product.slug_changed'), 0, 'cross-tenant attempt creates no audit event');
select is((select count(*)::integer from public.products where id = 'permalink-product-b2'), 0, 'authenticated tenant cannot read another tenant unpublished permalink');

reset role;
select is(private.normalize_product_slug('  Ação / 10×15  '), 'acao-10-15', 'normalizer handles punctuation and accents');

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select ok(not has_table_privilege('anon', 'public.products', 'select'), 'anon retains no direct products table privilege');
select throws_ok(
  $$select slug from public.products where id = 'permalink-product-b2'$$,
  '42501',
  'permission denied for table products',
  'anon cannot enumerate reserved unpublished product permalinks through the Data API'
);
reset role;

select * from finish();
rollback;
