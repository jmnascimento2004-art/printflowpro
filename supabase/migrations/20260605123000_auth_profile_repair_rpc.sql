-- PRINTFLOWPRO - repair Auth users that already exist without an active ERP profile
-- Safe/idempotent. This complements the signup trigger for users created before the trigger existed.

create extension if not exists pgcrypto;

create or replace function public.provision_current_auth_user()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := coalesce((auth.jwt() ->> 'email'), '');
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
  end if;

  insert into public.companies (id, name, document, email, theme_color)
  values (new_company_id, company_name, '', current_email, 'violet')
  on conflict (id) do nothing;

  insert into public.settings (company_id)
  values (new_company_id)
  on conflict (company_id) do nothing;

  insert into public.profiles (company_id, auth_user_id, name, email, role, active)
  values (new_company_id, current_user_id, profile_name, current_email, 'admin', true)
  returning * into profile_record;

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

  return to_jsonb(profile_record);
end;
$$;

revoke all on function public.provision_current_auth_user() from public;
revoke all on function public.provision_current_auth_user() from anon;
grant execute on function public.provision_current_auth_user() to authenticated;
