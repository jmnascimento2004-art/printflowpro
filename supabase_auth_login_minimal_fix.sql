-- PRINTFLOWPRO - Reparo minimo de login/perfil
-- Execute este arquivo inteiro no Supabase SQL Editor.
-- Nao usa function, trigger, $$ ou $provision$.
-- Nao apaga dados existentes.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists idx_profiles_auth_user_id
  on public.profiles(auth_user_id)
  where auth_user_id is not null;

-- Se nao existir empresa nenhuma, cria uma empresa padrao para vincular o usuario.
insert into public.companies (id, name, document, email, theme_color)
select gen_random_uuid()::text, 'Minha empresa', '', '', 'violet'
where not exists (
  select 1
  from public.companies
);

-- Liga usuarios do Supabase Auth a perfis existentes pelo mesmo e-mail.
update public.profiles p
set
  auth_user_id = u.id,
  active = true,
  updated_at = now()
from auth.users u
where lower(p.email) = lower(u.email)
  and (p.auth_user_id is null or p.auth_user_id = u.id);

-- Cria perfil admin para usuarios Auth que ainda nao possuem perfil no ERP.
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
  (
    select c.id
    from public.companies c
    order by c.id asc
    limit 1
  ),
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1), 'Administrador'),
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

alter table public.profiles enable row level security;

drop policy if exists "tenant_profiles_select" on public.profiles;
create policy "tenant_profiles_select"
on public.profiles
for select
to authenticated
using (
  auth_user_id = (select auth.uid())
  or lower(email) = lower(((select auth.jwt()) ->> 'email'))
);

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

select
  'printflow_auth_login_minimal_fix_ok' as status,
  count(*) as perfis_ativos_com_auth
from public.profiles
where active is true
  and auth_user_id is not null;
