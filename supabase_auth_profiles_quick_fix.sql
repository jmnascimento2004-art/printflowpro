-- PRINTFLOWPRO - Reparo rapido de login Auth + Profiles
-- Execute este arquivo inteiro no Supabase SQL Editor.
-- Nao selecione apenas uma parte do texto.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists idx_profiles_auth_user_id
  on public.profiles(auth_user_id)
  where auth_user_id is not null;

-- Permite que o usuario autenticado encontre o proprio perfil pelo auth_user_id ou e-mail.
alter table public.profiles enable row level security;

drop policy if exists tenant_profiles_select on public.profiles;
drop policy if exists "tenant_profiles_select" on public.profiles;
create policy "tenant_profiles_select"
on public.profiles
for select
to authenticated
using (
  auth_user_id = (select auth.uid())
  or lower(email) = lower(((select auth.jwt()) ->> 'email'))
);

drop policy if exists tenant_profiles_claim_auth_user on public.profiles;
drop policy if exists "tenant_profiles_claim_auth_user" on public.profiles;
create policy "tenant_profiles_claim_auth_user"
on public.profiles
for update
to authenticated
using (
  auth_user_id is null
  and lower(email) = lower(((select auth.jwt()) ->> 'email'))
)
with check (
  auth_user_id = (select auth.uid())
  and lower(email) = lower(((select auth.jwt()) ->> 'email'))
);

grant select, update, insert on public.profiles to authenticated;
grant select, insert, update on public.companies to authenticated;
grant select, insert, update on public.settings to authenticated;
grant select, insert, update on public.role_permissions to authenticated;

-- Funcao menor para reparar/criar perfil do usuario logado.
create or replace function public.provision_current_auth_user()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $provision$
declare
  current_user_id uuid := auth.uid();
  current_email text := coalesce((auth.jwt() ->> 'email'), '');
  target_company_id text;
  profile_record public.profiles%rowtype;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select *
  into profile_record
  from public.profiles
  where auth_user_id = current_user_id
     or lower(email) = lower(current_email)
  order by case when auth_user_id = current_user_id then 0 else 1 end
  limit 1;

  if found then
    update public.profiles
    set
      auth_user_id = current_user_id,
      email = coalesce(nullif(email, ''), current_email),
      active = true,
      updated_at = now()
    where id = profile_record.id
    returning * into profile_record;

    return to_jsonb(profile_record);
  end if;

  select id
  into target_company_id
  from public.companies
  order by
    case when nullif(document, '') is not null then 0 else 1 end,
    updated_at asc nulls last,
    id asc
  limit 1;

  if target_company_id is null then
    target_company_id := gen_random_uuid()::text;

    insert into public.companies (id, name, document, email, theme_color)
    values (target_company_id, 'Minha empresa', '', current_email, 'violet');
  end if;

  insert into public.settings (company_id)
  values (target_company_id)
  on conflict (company_id) do nothing;

  insert into public.profiles (company_id, auth_user_id, name, email, role, active)
  values (
    target_company_id,
    current_user_id,
    coalesce(nullif(split_part(current_email, '@', 1), ''), 'Administrador'),
    current_email,
    'admin',
    true
  )
  returning * into profile_record;

  return to_jsonb(profile_record);
end;
$provision$;

revoke all on function public.provision_current_auth_user() from public;
revoke all on function public.provision_current_auth_user() from anon;
grant execute on function public.provision_current_auth_user() to authenticated;

select 'printflow_auth_profiles_quick_fix_ok' as status;
