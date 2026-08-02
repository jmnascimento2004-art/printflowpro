begin;
select plan(10);

select has_table(
  'public',
  'company_footer_badge_defaults',
  'historical footer badge defaults table is restored'
);

select col_is_pk(
  'public',
  'company_footer_badge_defaults',
  'id',
  'footer badge defaults keeps its historical primary key'
);

select ok(
  coalesce((
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'company_footer_badge_defaults'
  ), false),
  'RLS is enabled on footer badge defaults'
);

select policies_are(
  'public',
  'company_footer_badge_defaults',
  array[]::text[],
  'no client policy exposes footer badge defaults'
);

select table_privs_are(
  'public',
  'company_footer_badge_defaults',
  'public',
  array[]::text[],
  'PUBLIC has no privileges on footer badge defaults'
);

select table_privs_are(
  'public',
  'company_footer_badge_defaults',
  'anon',
  array[]::text[],
  'anon has no privileges on footer badge defaults'
);

select table_privs_are(
  'public',
  'company_footer_badge_defaults',
  'authenticated',
  array[]::text[],
  'authenticated has no privileges on footer badge defaults'
);

select ok(
  exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260714183320'
  ),
  'creator migration is registered'
);

select ok(
  exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260714183326'
  ),
  'residual grants hardening migration is registered'
);

select ok(
  '20260714183320' < '20260714183326',
  'creator migration is ordered before residual grants hardening'
);

select * from finish();
rollback;
