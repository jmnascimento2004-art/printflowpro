create or replace function private.current_company_id()
returns text language sql stable security definer set search_path = pg_catalog
as $$
  select p.company_id from public.profiles p
  where p.auth_user_id = auth.uid() and p.active = true
  order by p.id limit 1
$$;

create or replace function private.current_user_role()
returns text language sql stable security definer set search_path = pg_catalog
as $$
  select p.role from public.profiles p
  where p.auth_user_id = auth.uid() and p.active = true
  order by p.id limit 1
$$;

revoke all on function private.current_company_id() from public, anon;
revoke all on function private.current_user_role() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.current_company_id() to authenticated;
grant execute on function private.current_user_role() to authenticated;
