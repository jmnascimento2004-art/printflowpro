-- PRINTFLOWPRO - Reparo de login SEM funcao PL/pgSQL
-- Execute este arquivo inteiro no Supabase SQL Editor.
-- Este script nao usa $$, nao usa $provision$ e nao cria trigger.
-- Seguro e aditivo: nao apaga empresas, perfis, produtos, pedidos ou configuracoes.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists idx_profiles_auth_user_id
  on public.profiles(auth_user_id)
  where auth_user_id is not null;

-- Garante que exista pelo menos uma empresa para vincular usuarios sem perfil.
insert into public.companies (id, name, document, email, theme_color)
select gen_random_uuid()::text, 'Minha empresa', '', '', 'violet'
where not exists (select 1 from public.companies);

-- Vincula usuarios do Supabase Auth a perfis ERP ja existentes pelo e-mail.
update public.profiles p
set
  auth_user_id = u.id,
  active = true,
  updated_at = now()
from auth.users u
where lower(p.email) = lower(u.email)
  and (p.auth_user_id is null or p.auth_user_id = u.id);

-- Cria perfil admin para usuarios Auth que ainda nao possuem perfil ERP.
insert into public.profiles (
  id,
  company_id,
  auth_user_id,
  name,
  email,
  role,
  active,
  created_at,
  updated_at
)
select
  gen_random_uuid()::text,
  coalesce(
    (
      select c.id
      from public.companies c
      where lower(c.email) = lower(u.email)
      order by c.updated_at asc nulls last, c.id asc
      limit 1
    ),
    (
      select c.id
      from public.companies c
      order by c.updated_at asc nulls last, c.id asc
      limit 1
    )
  ) as company_id,
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1), 'Administrador') as name,
  u.email,
  'admin',
  true,
  now(),
  now()
from auth.users u
where not exists (
  select 1
  from public.profiles p
  where p.auth_user_id = u.id
     or lower(p.email) = lower(u.email)
);

-- Garante settings para empresas existentes.
insert into public.settings (company_id)
select c.id
from public.companies c
where not exists (
  select 1
  from public.settings s
  where s.company_id = c.id
);

-- Garante permissao basica por modulo para empresas existentes.
insert into public.role_permissions (company_id, path, roles)
select c.id, v.path, v.roles
from public.companies c
cross join (
  values
    ('/dashboard', array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']::text[]),
    ('/pos', array['admin','gerente','financeiro','vendas']::text[]),
    ('/crm', array['admin','gerente','financeiro','vendas']::text[]),
    ('/products', array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']::text[]),
    ('/quotes', array['admin','gerente','financeiro','vendas']::text[]),
    ('/pricing', array['admin','gerente','financeiro','vendas']::text[]),
    ('/orders', array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']::text[]),
    ('/production', array['admin','gerente','producao','arte_finalista']::text[]),
    ('/financial', array['admin','gerente','financeiro']::text[]),
    ('/stock', array['admin','gerente','financeiro','producao','estoque']::text[]),
    ('/shipment', array['admin','gerente','financeiro','producao']::text[]),
    ('/resale', array['admin','gerente','financeiro','vendas']::text[]),
    ('/settings', array['admin','gerente']::text[])
) as v(path, roles)
where not exists (
  select 1
  from public.role_permissions rp
  where rp.company_id = c.id
    and rp.path = v.path
);

-- RLS/policies minimas para o app encontrar o proprio perfil.
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

select
  'printflow_auth_profiles_no_function_fix_ok' as status,
  count(*) as perfis_ativos_com_auth
from public.profiles
where active is true
  and auth_user_id is not null;
