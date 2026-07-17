-- Separate ordinary profile edits from privileged access changes.
-- RLS limits rows; column grants limit fields; privileged mutations use audited RPCs.

alter table public.profiles enable row level security;

drop policy if exists tenant_profiles_update on public.profiles;
drop policy if exists tenant_profiles_admin_update on public.profiles;
drop policy if exists tenant_profiles_claim_auth_user on public.profiles;
drop policy if exists tenant_profiles_insert on public.profiles;
drop policy if exists tenant_profiles_delete on public.profiles;

create policy tenant_profiles_common_update
on public.profiles for update
to authenticated
using (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) in ('admin', 'gerente')
)
with check (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) in ('admin', 'gerente')
);

create policy tenant_profiles_insert
on public.profiles for insert
to authenticated
with check (
  company_id = (select private.current_company_id())
  and (
    (select private.current_user_role()) = 'admin'
    or (
      (select private.current_user_role()) = 'gerente'
      and role <> 'admin'
      and auth_user_id is null
    )
  )
);

-- UPDATE on the table is intentionally column-scoped. Access fields can only
-- be changed by the RPC below. This also blocks direct company/user rebinding.
revoke update on table public.profiles from authenticated;
grant update (name, email, phone, avatar_url) on table public.profiles to authenticated;
grant insert (id, company_id, name, email, role, active, phone, avatar_url) on table public.profiles to authenticated;

-- Permission matrices are access control, so managers may read but only an
-- administrator can mutate them.
-- The original tenant_role_permissions_all policy was permissive and would be
-- OR-combined with the stricter command policies below, so it must be removed.
drop policy if exists tenant_role_permissions_all on public.role_permissions;
drop policy if exists tenant_role_permissions_insert on public.role_permissions;
drop policy if exists tenant_role_permissions_update on public.role_permissions;
drop policy if exists tenant_role_permissions_delete on public.role_permissions;

create policy tenant_role_permissions_insert
on public.role_permissions for insert to authenticated
with check (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) = 'admin'
);
create policy tenant_role_permissions_update
on public.role_permissions for update to authenticated
using (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) = 'admin'
)
with check (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) = 'admin'
);
create policy tenant_role_permissions_delete
on public.role_permissions for delete to authenticated
using (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) = 'admin'
);

create or replace function private.guard_last_company_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_admins integer;
begin
  if old.role = 'admin' and old.active = true and tg_op = 'DELETE' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old.company_id, 0));
    select count(*) into remaining_admins
    from public.profiles p
    where p.company_id = old.company_id and p.role = 'admin' and p.active = true and p.id <> old.id;
    if remaining_admins = 0 then
      raise exception 'last_company_admin' using errcode = 'P0001';
    end if;
  elsif old.role = 'admin' and old.active = true and (new.role <> 'admin' or new.active is distinct from true) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old.company_id, 0));
    select count(*) into remaining_admins
    from public.profiles p
    where p.company_id = old.company_id
      and p.role = 'admin'
      and p.active = true
      and p.id <> old.id;

    if remaining_admins = 0 then
      raise exception 'last_company_admin' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.guard_last_company_admin() from public, anon, authenticated;
drop trigger if exists guard_last_company_admin on public.profiles;
create trigger guard_last_company_admin
before update of role, active or delete on public.profiles
for each row execute function private.guard_last_company_admin();

create or replace function public.set_profile_access(
  p_profile_id text,
  p_role text,
  p_active boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.profiles%rowtype;
  target public.profiles%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_role is null or p_active is null or p_role not in ('admin', 'gerente', 'financeiro', 'vendas', 'producao', 'estoque', 'arte_finalista') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  select * into caller
  from public.profiles p
  where p.auth_user_id = (select auth.uid()) and p.active = true
  limit 1;
  if not found or caller.role <> 'admin' then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller.company_id, 0));
  select * into target
  from public.profiles p
  where p.id = p_profile_id
  for update;
  if not found or target.company_id <> caller.company_id then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  update public.profiles
  set role = p_role, active = p_active
  where id = target.id
  returning * into target;
  return target;
end;
$$;

create or replace function public.delete_company_profile(p_profile_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.profiles%rowtype;
  target public.profiles%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into caller
  from public.profiles p
  where p.auth_user_id = (select auth.uid()) and p.active = true
  limit 1;
  if not found or caller.role <> 'admin' then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller.company_id, 0));
  select * into target from public.profiles p where p.id = p_profile_id for update;
  if not found or target.company_id <> caller.company_id then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  delete from public.profiles where id = target.id;
  return true;
end;
$$;

revoke all on function public.set_profile_access(text, text, boolean) from public, anon;
revoke all on function public.delete_company_profile(text) from public, anon;
grant execute on function public.set_profile_access(text, text, boolean) to authenticated;
grant execute on function public.delete_company_profile(text) to authenticated;

select pg_notify('pgrst', 'reload schema');
