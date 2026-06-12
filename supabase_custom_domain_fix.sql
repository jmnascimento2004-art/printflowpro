-- PRINTFLOWPRO - DOMINIO PROPRIO POR EMPRESA
-- Execute no Supabase SQL Editor.
-- Script seguro/idempotente: nao apaga tabelas e nao altera dados existentes.

begin;

alter table public.companies
  add column if not exists admin_domain text,
  add column if not exists store_domain text,
  add column if not exists custom_domain text,
  add column if not exists custom_domain_status text not null default 'not_configured',
  add column if not exists custom_domain_verified_at timestamptz;

alter table public.companies
  drop constraint if exists companies_custom_domain_status_check;

alter table public.companies
  add constraint companies_custom_domain_status_check
  check (custom_domain_status in ('not_configured', 'pending', 'active', 'error'));

create unique index if not exists companies_admin_domain_unique
  on public.companies (lower(admin_domain))
  where admin_domain is not null and admin_domain <> '';

create unique index if not exists companies_store_domain_unique
  on public.companies (lower(store_domain))
  where store_domain is not null and store_domain <> '';

create unique index if not exists companies_custom_domain_unique
  on public.companies (lower(custom_domain))
  where custom_domain is not null and custom_domain <> '';

commit;
