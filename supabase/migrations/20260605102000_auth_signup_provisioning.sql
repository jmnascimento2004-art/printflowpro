-- PRINTFLOWPRO - automatic tenant provisioning for Supabase Auth signups
-- Creates one company and one admin profile when a new auth user signs up.

create extension if not exists pgcrypto;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_company_id text := gen_random_uuid()::text;
  profile_name text := coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1), 'Administrador');
  company_name text := coalesce(nullif(new.raw_user_meta_data ->> 'company_name', ''), 'Minha empresa');
begin
  insert into public.companies (id, name, document, email)
  values (new_company_id, company_name, '', new.email)
  on conflict (id) do nothing;

  insert into public.settings (company_id)
  values (new_company_id)
  on conflict (company_id) do nothing;

  insert into public.profiles (company_id, auth_user_id, name, email, role, active)
  values (new_company_id, new.id, profile_name, new.email, 'admin', true)
  on conflict (auth_user_id) where auth_user_id is not null do update
  set
    name = excluded.name,
    email = excluded.email,
    active = true,
    updated_at = now();

  insert into public.role_permissions (company_id, path, roles)
  values
    (new_company_id, '/dashboard', array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']),
    (new_company_id, '/pos', array['admin','gerente','financeiro','vendas']),
    (new_company_id, '/crm', array['admin','gerente','financeiro','vendas']),
    (new_company_id, '/products', array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']),
    (new_company_id, '/quotes', array['admin','gerente','financeiro','vendas']),
    (new_company_id, '/pricing', array['admin','gerente','financeiro','vendas']),
    (new_company_id, '/orders', array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']),
    (new_company_id, '/production', array['admin','gerente','producao','arte_finalista']),
    (new_company_id, '/financial', array['admin','gerente','financeiro']),
    (new_company_id, '/stock', array['admin','gerente','financeiro','producao','estoque']),
    (new_company_id, '/shipment', array['admin','gerente','financeiro','producao']),
    (new_company_id, '/resale', array['admin','gerente','financeiro','vendas']),
    (new_company_id, '/settings', array['admin','gerente'])
  on conflict (company_id, path) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();
