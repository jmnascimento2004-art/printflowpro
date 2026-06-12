-- PRINTFLOWPRO - Reparo de Login Supabase Auth + Profiles
-- Execute este SQL no Supabase SQL Editor.
-- Seguro e aditivo: nao apaga empresas, perfis, produtos, pedidos ou configuracoes.

create extension if not exists pgcrypto;
create schema if not exists private;

alter table public.profiles
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists idx_profiles_auth_user_id
  on public.profiles(auth_user_id)
  where auth_user_id is not null;

create index if not exists idx_profiles_auth_company
  on public.profiles(auth_user_id, company_id)
  where auth_user_id is not null;

-- Permite descobrir a empresa do usuario autenticado para RLS e politicas.
create or replace function private.current_company_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.company_id
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
    and p.active = true
  limit 1
$$;

create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
    and p.active = true
  limit 1
$$;

revoke all on function private.current_company_id() from public;
revoke all on function private.current_user_role() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_company_id() to authenticated;
grant execute on function private.current_user_role() to authenticated;

-- Funcao chamada pelo app quando a sessao Auth existe, mas o perfil ERP nao foi encontrado.
create or replace function public.provision_current_auth_user()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := coalesce((auth.jwt() ->> 'email'), '');
  target_company_id text;
  new_company_id text := gen_random_uuid()::text;
  profile_name text := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    nullif(split_part(current_email, '@', 1), ''),
    'Administrador'
  );
  company_name text := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'company_name', ''),
    'Minha empresa'
  );
  profile_record public.profiles%rowtype;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select *
  into profile_record
  from public.profiles
  where auth_user_id = current_user_id
  limit 1;

  if found then
    if profile_record.active is distinct from true then
      update public.profiles
      set active = true, updated_at = now()
      where id = profile_record.id
      returning * into profile_record;
    end if;

    return to_jsonb(profile_record);
  end if;

  if current_email <> '' then
    select *
    into profile_record
    from public.profiles
    where lower(email) = lower(current_email)
    order by updated_at asc nulls last
    limit 1;

    if found then
      update public.profiles
      set
        auth_user_id = current_user_id,
        active = true,
        name = coalesce(nullif(name, ''), profile_name),
        updated_at = now()
      where id = profile_record.id
      returning * into profile_record;

      return to_jsonb(profile_record);
    end if;

    select id
    into target_company_id
    from public.companies
    where lower(email) = lower(current_email)
    order by
      case when nullif(document, '') is not null then 0 else 1 end,
      updated_at asc nulls last,
      id asc
    limit 1;
  end if;

  if target_company_id is null then
    target_company_id := new_company_id;

    insert into public.companies (id, name, document, email, theme_color)
    values (target_company_id, company_name, '', current_email, 'violet')
    on conflict (id) do nothing;
  end if;

  insert into public.settings (company_id)
  values (target_company_id)
  on conflict (company_id) do nothing;

  insert into public.profiles (company_id, auth_user_id, name, email, role, active)
  values (target_company_id, current_user_id, profile_name, current_email, 'admin', true)
  returning * into profile_record;

  insert into public.role_permissions (company_id, path, roles)
  values
    (target_company_id, '/dashboard', array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']),
    (target_company_id, '/pos', array['admin','gerente','financeiro','vendas']),
    (target_company_id, '/crm', array['admin','gerente','financeiro','vendas']),
    (target_company_id, '/products', array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']),
    (target_company_id, '/quotes', array['admin','gerente','financeiro','vendas']),
    (target_company_id, '/pricing', array['admin','gerente','financeiro','vendas']),
    (target_company_id, '/orders', array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']),
    (target_company_id, '/production', array['admin','gerente','producao','arte_finalista']),
    (target_company_id, '/financial', array['admin','gerente','financeiro']),
    (target_company_id, '/stock', array['admin','gerente','financeiro','producao','estoque']),
    (target_company_id, '/shipment', array['admin','gerente','financeiro','producao']),
    (target_company_id, '/resale', array['admin','gerente','financeiro','vendas']),
    (target_company_id, '/settings', array['admin','gerente'])
  on conflict (company_id, path) do nothing;

  return to_jsonb(profile_record);
end;
$$;

revoke all on function public.provision_current_auth_user() from public;
revoke all on function public.provision_current_auth_user() from anon;
grant execute on function public.provision_current_auth_user() to authenticated;

-- Trigger para proximas contas criadas pelo Supabase Auth.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_company_id text := gen_random_uuid()::text;
  target_company_id text;
  profile_name text := coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1), 'Administrador');
  company_name text := coalesce(nullif(new.raw_user_meta_data ->> 'company_name', ''), 'Minha empresa');
begin
  select id
  into target_company_id
  from public.companies
  where lower(email) = lower(new.email)
  order by
    case when nullif(document, '') is not null then 0 else 1 end,
    updated_at asc nulls last,
    id asc
  limit 1;

  if target_company_id is null then
    target_company_id := new_company_id;

    insert into public.companies (id, name, document, email, theme_color)
    values (target_company_id, company_name, '', new.email, 'violet')
    on conflict (id) do nothing;
  end if;

  insert into public.settings (company_id)
  values (target_company_id)
  on conflict (company_id) do nothing;

  insert into public.profiles (company_id, auth_user_id, name, email, role, active)
  values (target_company_id, new.id, profile_name, new.email, 'admin', true)
  on conflict (auth_user_id) where auth_user_id is not null do update
  set
    company_id = excluded.company_id,
    name = excluded.name,
    email = excluded.email,
    active = true,
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

-- Politicas minimas para o usuario logado ver/reparar o proprio perfil.
alter table public.profiles enable row level security;

drop policy if exists "tenant_profiles_select" on public.profiles;
create policy "tenant_profiles_select"
on public.profiles for select
to authenticated
using (
  company_id = private.current_company_id()
  or auth_user_id = (select auth.uid())
  or (auth_user_id is null and lower(email) = lower(((select auth.jwt()) ->> 'email')))
);

drop policy if exists "tenant_profiles_claim_auth_user" on public.profiles;
create policy "tenant_profiles_claim_auth_user"
on public.profiles for update
to authenticated
using (
  auth_user_id is null
  and lower(email) = lower(((select auth.jwt()) ->> 'email'))
)
with check (
  auth_user_id = (select auth.uid())
  and lower(email) = lower(((select auth.jwt()) ->> 'email'))
);

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.companies, public.settings, public.role_permissions to authenticated;

-- Diagnostico: mostra perfis existentes para o e-mail logado quando executado via app/RPC.
select 'auth_profiles_fix_applied' as status;
