-- Restore tenant-scoped profile management after the P0 RLS rollout.
-- The claim policy remains dedicated to first-login profile binding; this
-- policy permits only company administrators/managers to manage profiles.
drop policy if exists tenant_profiles_admin_select on public.profiles;
create policy tenant_profiles_admin_select
on public.profiles for select
to authenticated
using (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) in ('admin', 'gerente')
);

drop policy if exists tenant_profiles_admin_update on public.profiles;
create policy tenant_profiles_admin_update
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

select pg_notify('pgrst', 'reload schema');
