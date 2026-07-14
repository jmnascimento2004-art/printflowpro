-- PRINTFLOWPRO - Least-privilege Data API grants for residual public tables.
--
-- The project predates Supabase's explicit-grants default and these tables
-- inherited broad CRUD grants. RLS already constrains rows, but table grants
-- are an independent security boundary and must expose only used operations.
--
-- Intentional public surface:
--   * cookie_preferences: INSERT for the anonymous cookie banner;
--   * data_subject_requests: INSERT for the public LGPD form;
--   * privacy_policy_versions: SELECT, restricted by the published/active RLS policy.
-- All other residual tables remain unavailable to anon. PUBLIC receives no access.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'company_footer_badge_defaults',
    'cookie_preferences',
    'customer_addresses',
    'customer_consents',
    'data_subject_requests',
    'privacy_audit_events',
    'privacy_policy_versions',
    'profiles',
    'store_customer_accounts',
    'store_customer_favorites'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'Required residual table public.% is missing', table_name;
    end if;

    if not coalesce((
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name
    ), false) then
      raise exception 'RLS must be enabled on public.% before grants are changed', table_name;
    end if;
  end loop;
end
$$;

revoke all privileges on table
  public.company_footer_badge_defaults,
  public.cookie_preferences,
  public.customer_addresses,
  public.customer_consents,
  public.data_subject_requests,
  public.privacy_audit_events,
  public.privacy_policy_versions,
  public.profiles,
  public.store_customer_accounts,
  public.store_customer_favorites
from public, anon, authenticated;

-- Anonymous Data API operations proven by current store consumers and policies.
grant insert on table public.cookie_preferences to anon;
grant insert on table public.data_subject_requests to anon;
grant select on table public.privacy_policy_versions to anon;

-- Authenticated store-customer and ERP operations proven by current consumers.
grant insert on table public.cookie_preferences to authenticated;
grant select, insert, update, delete on table public.customer_addresses to authenticated;
grant select, insert on table public.customer_consents to authenticated;
grant select, insert on table public.data_subject_requests to authenticated;
grant insert on table public.privacy_audit_events to authenticated;
grant select on table public.privacy_policy_versions to authenticated;
grant select, update on table public.profiles to authenticated;
grant select on table public.store_customer_accounts to authenticated;
grant select, insert, delete on table public.store_customer_favorites to authenticated;

-- Deliberately no client grants for company_footer_badge_defaults. Its values
-- have no direct browser consumer; server-side access remains available through
-- service_role, whose existing privileges are not modified by this migration.

do $$
begin
  if has_table_privilege('anon', 'public.company_footer_badge_defaults', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'public.customer_addresses', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'public.customer_consents', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'public.privacy_audit_events', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'public.profiles', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'public.store_customer_accounts', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'public.store_customer_favorites', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Unexpected anon privilege remains on a sensitive residual table';
  end if;

  if not has_table_privilege('anon', 'public.cookie_preferences', 'INSERT')
     or has_table_privilege('anon', 'public.cookie_preferences', 'SELECT,UPDATE,DELETE')
     or not has_table_privilege('anon', 'public.data_subject_requests', 'INSERT')
     or has_table_privilege('anon', 'public.data_subject_requests', 'SELECT,UPDATE,DELETE')
     or not has_table_privilege('anon', 'public.privacy_policy_versions', 'SELECT')
     or has_table_privilege('anon', 'public.privacy_policy_versions', 'INSERT,UPDATE,DELETE') then
    raise exception 'Intentional public residual grants do not match the approved matrix';
  end if;
end
$$;

select pg_notify('pgrst', 'reload schema');
