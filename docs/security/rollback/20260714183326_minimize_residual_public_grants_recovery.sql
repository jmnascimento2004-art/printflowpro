-- Safe recovery for 20260714183326_minimize_residual_public_grants.sql.
--
-- This recovery intentionally does not restore the previous broad grants.
-- It reasserts the minimum proven Data API contract if the rollout is partial
-- or an individual grant needs to be recovered. Run with ON_ERROR_STOP and in
-- an operator-controlled transaction. RLS remains enabled throughout.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'company_footer_badge_defaults', 'cookie_preferences', 'customer_addresses',
    'customer_consents', 'data_subject_requests', 'privacy_audit_events',
    'privacy_policy_versions', 'profiles', 'store_customer_accounts',
    'store_customer_favorites'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'Recovery precondition failed: public.% is missing', table_name;
    end if;

    if not coalesce((
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name
    ), false) then
      raise exception 'Recovery refuses to continue without RLS on public.%', table_name;
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

grant insert on table public.cookie_preferences to anon;
grant insert on table public.data_subject_requests to anon;
grant select on table public.privacy_policy_versions to anon;

grant insert on table public.cookie_preferences to authenticated;
grant select, insert, update, delete on table public.customer_addresses to authenticated;
grant select, insert on table public.customer_consents to authenticated;
grant select, insert on table public.data_subject_requests to authenticated;
grant insert on table public.privacy_audit_events to authenticated;
grant select on table public.privacy_policy_versions to authenticated;
grant select, update on table public.profiles to authenticated;
grant select on table public.store_customer_accounts to authenticated;
grant select, insert, delete on table public.store_customer_favorites to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    where n.nspname = 'public'
      and c.relname = any (array[
        'company_footer_badge_defaults', 'cookie_preferences', 'customer_addresses',
        'customer_consents', 'data_subject_requests', 'privacy_audit_events',
        'privacy_policy_versions', 'profiles', 'store_customer_accounts',
        'store_customer_favorites'
      ])
      and acl.grantee = 0
      and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'Recovery postcondition failed: PUBLIC has a residual table privilege';
  end if;

  if not has_table_privilege('anon', 'public.cookie_preferences', 'INSERT')
     or has_table_privilege('anon', 'public.cookie_preferences', 'SELECT,UPDATE,DELETE')
     or not has_table_privilege('anon', 'public.data_subject_requests', 'INSERT')
     or has_table_privilege('anon', 'public.data_subject_requests', 'SELECT,UPDATE,DELETE')
     or not has_table_privilege('anon', 'public.privacy_policy_versions', 'SELECT')
     or has_table_privilege('anon', 'public.privacy_policy_versions', 'INSERT,UPDATE,DELETE') then
    raise exception 'Recovery postcondition failed: anon grants differ from the approved minimum';
  end if;

  if not has_table_privilege('authenticated', 'public.customer_addresses', 'SELECT')
     or not has_table_privilege('authenticated', 'public.customer_addresses', 'INSERT')
     or not has_table_privilege('authenticated', 'public.customer_addresses', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.customer_addresses', 'DELETE')
     or not has_table_privilege('authenticated', 'public.customer_consents', 'SELECT')
     or not has_table_privilege('authenticated', 'public.customer_consents', 'INSERT')
     or not has_table_privilege('authenticated', 'public.data_subject_requests', 'SELECT')
     or not has_table_privilege('authenticated', 'public.data_subject_requests', 'INSERT')
     or not has_table_privilege('authenticated', 'public.profiles', 'SELECT')
     or not has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.profiles', 'INSERT,DELETE')
     or not has_table_privilege('authenticated', 'public.store_customer_accounts', 'SELECT')
     or not has_table_privilege('authenticated', 'public.store_customer_favorites', 'SELECT')
     or not has_table_privilege('authenticated', 'public.store_customer_favorites', 'INSERT')
     or not has_table_privilege('authenticated', 'public.store_customer_favorites', 'DELETE') then
    raise exception 'Recovery postcondition failed: authenticated grants are incomplete';
  end if;
end
$$;

select pg_notify('pgrst', 'reload schema');
