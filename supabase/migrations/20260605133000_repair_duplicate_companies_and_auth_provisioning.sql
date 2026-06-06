-- PRINTFLOWPRO - repair duplicate empty companies created by auth provisioning
-- Safe/idempotent. Does not delete companies or business data.

create extension if not exists pgcrypto;

with ranked_companies as (
  select
    id,
    lower(nullif(email, '')) as normalized_email,
    row_number() over (
      partition by lower(nullif(email, ''))
      order by
        case when nullif(logo_light, '') is not null then 0 else 1 end,
        case when nullif(favicon, '') is not null then 0 else 1 end,
        case when nullif(document, '') is not null then 0 else 1 end,
        updated_at asc nulls last,
        id asc
    ) as rank
  from public.companies
  where nullif(email, '') is not null
),
canonical_companies as (
  select normalized_email, id as canonical_company_id
  from ranked_companies
  where rank = 1
),
duplicate_companies as (
  select r.id as duplicate_company_id, c.canonical_company_id
  from ranked_companies r
  join canonical_companies c on c.normalized_email = r.normalized_email
  where r.rank > 1
    and r.id <> c.canonical_company_id
)
update public.profiles p
set company_id = d.canonical_company_id,
    updated_at = now()
from duplicate_companies d
where p.company_id = d.duplicate_company_id;

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
      case when nullif(logo_light, '') is not null then 0 else 1 end,
      case when nullif(favicon, '') is not null then 0 else 1 end,
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
    case when nullif(logo_light, '') is not null then 0 else 1 end,
    case when nullif(favicon, '') is not null then 0 else 1 end,
    case when nullif(document, '') is not null then 0 else 1 end,
    updated_at asc nulls last,
    id asc
  limit 1;

  if target_company_id is null then
    target_company_id := new_company_id;

    insert into public.companies (id, name, document, email)
    values (target_company_id, company_name, '', new.email)
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

  return new;
end;
$$;
