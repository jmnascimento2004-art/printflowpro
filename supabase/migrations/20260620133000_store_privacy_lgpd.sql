-- PRINTFLOWPRO - LGPD/privacy layer for public store and final-customer area.
-- Additive migration: no existing data is deleted.

create schema if not exists private;

alter table public.companies
  add column if not exists privacy_email text,
  add column if not exists privacy_contact_name text,
  add column if not exists privacy_contact_channel text,
  add column if not exists privacy_policy_version text default '2026-06',
  add column if not exists privacy_policy_updated_at timestamptz,
  add column if not exists privacy_retention_summary text,
  add column if not exists privacy_third_parties jsonb default '[]'::jsonb;

create table if not exists public.privacy_policy_versions (
  id text primary key default (gen_random_uuid()::text),
  company_id text not null references public.companies(id) on delete cascade,
  store_id text,
  policy_type text not null check (policy_type in ('privacy', 'cookies', 'terms')),
  version text not null,
  title text not null,
  content text,
  published_at timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, store_id, policy_type, version)
);

create table if not exists public.customer_consents (
  id text primary key default (gen_random_uuid()::text),
  company_id text not null references public.companies(id) on delete cascade,
  store_id text,
  customer_id text references public.customers(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  anonymous_identifier text,
  consent_type text not null,
  granted boolean not null default false,
  policy_version text not null,
  source text not null default 'store',
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cookie_preferences (
  id text primary key default (gen_random_uuid()::text),
  company_id text not null references public.companies(id) on delete cascade,
  store_id text,
  anonymous_identifier text not null,
  customer_id text references public.customers(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  necessary boolean not null default true,
  preferences boolean not null default false,
  analytics boolean not null default false,
  marketing boolean not null default false,
  policy_version text not null,
  source text not null default 'banner',
  consented_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.data_subject_requests (
  id text primary key default (gen_random_uuid()::text),
  company_id text not null references public.companies(id) on delete cascade,
  store_id text,
  customer_id text references public.customers(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  request_type text not null check (
    request_type in (
      'acesso',
      'correcao',
      'exclusao',
      'anonimizacao',
      'portabilidade',
      'revogacao_consentimento',
      'informacao_compartilhamento',
      'oposicao_tratamento',
      'outro'
    )
  ),
  status text not null default 'recebida' check (status in ('recebida', 'em_analise', 'aguardando_identidade', 'respondida', 'indeferida', 'resolvida')),
  requester_name text,
  requester_email text,
  requester_identifier_hint text,
  request_details text not null,
  response_details text,
  source text not null default 'store',
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  handled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.privacy_audit_events (
  id text primary key default (gen_random_uuid()::text),
  company_id text references public.companies(id) on delete cascade,
  store_id text,
  customer_id text references public.customers(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  anonymous_identifier text,
  event_type text not null,
  event_details jsonb not null default '{}'::jsonb,
  source text not null default 'store',
  created_at timestamptz not null default now()
);

create index if not exists idx_privacy_policy_versions_company_type
  on public.privacy_policy_versions(company_id, policy_type, is_active);
create index if not exists idx_customer_consents_customer
  on public.customer_consents(company_id, customer_id, consent_type, created_at desc);
create index if not exists idx_customer_consents_auth
  on public.customer_consents(auth_user_id, company_id, created_at desc);
create index if not exists idx_cookie_preferences_anonymous
  on public.cookie_preferences(company_id, anonymous_identifier, consented_at desc);
create index if not exists idx_data_subject_requests_company
  on public.data_subject_requests(company_id, status, requested_at desc);
create index if not exists idx_data_subject_requests_customer
  on public.data_subject_requests(company_id, customer_id, requested_at desc);
create index if not exists idx_privacy_audit_events_company
  on public.privacy_audit_events(company_id, event_type, created_at desc);

drop trigger if exists set_timestamp_privacy_policy_versions on public.privacy_policy_versions;
create trigger set_timestamp_privacy_policy_versions
before update on public.privacy_policy_versions
for each row execute procedure trigger_set_timestamp();

drop trigger if exists set_timestamp_customer_consents on public.customer_consents;
create trigger set_timestamp_customer_consents
before update on public.customer_consents
for each row execute procedure trigger_set_timestamp();

drop trigger if exists set_timestamp_cookie_preferences on public.cookie_preferences;
create trigger set_timestamp_cookie_preferences
before update on public.cookie_preferences
for each row execute procedure trigger_set_timestamp();

drop trigger if exists set_timestamp_data_subject_requests on public.data_subject_requests;
create trigger set_timestamp_data_subject_requests
before update on public.data_subject_requests
for each row execute procedure trigger_set_timestamp();

create or replace function private.current_store_customer_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.customer_id
  from public.store_customer_accounts a
  where a.auth_user_id = (select auth.uid())
    and a.status = 'active'
  limit 1
$$;

create or replace function private.current_store_company_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.company_id
  from public.store_customer_accounts a
  where a.auth_user_id = (select auth.uid())
    and a.status = 'active'
  limit 1
$$;

alter table public.privacy_policy_versions enable row level security;
alter table public.customer_consents enable row level security;
alter table public.cookie_preferences enable row level security;
alter table public.data_subject_requests enable row level security;
alter table public.privacy_audit_events enable row level security;

grant select on public.privacy_policy_versions to anon, authenticated;
grant insert on public.cookie_preferences to anon, authenticated;
grant insert on public.data_subject_requests to anon, authenticated;
grant select, insert on public.customer_consents to authenticated;
grant select, insert, update on public.data_subject_requests to authenticated;
grant insert on public.privacy_audit_events to authenticated;

drop policy if exists "privacy_policy_public_active_select" on public.privacy_policy_versions;
create policy "privacy_policy_public_active_select"
on public.privacy_policy_versions for select
to anon, authenticated
using (is_active = true and published_at is not null);

drop policy if exists "customer_consents_self_select" on public.customer_consents;
create policy "customer_consents_self_select"
on public.customer_consents for select
to authenticated
using (
  auth_user_id = (select auth.uid())
  or exists (
    select 1 from public.store_customer_accounts a
    where a.customer_id = customer_consents.customer_id
      and a.company_id = customer_consents.company_id
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
);

drop policy if exists "customer_consents_self_insert" on public.customer_consents;
create policy "customer_consents_self_insert"
on public.customer_consents for insert
to authenticated
with check (
  auth_user_id = (select auth.uid())
  or exists (
    select 1 from public.store_customer_accounts a
    where a.customer_id = customer_consents.customer_id
      and a.company_id = customer_consents.company_id
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
);

drop policy if exists "cookie_preferences_public_insert" on public.cookie_preferences;
create policy "cookie_preferences_public_insert"
on public.cookie_preferences for insert
to anon, authenticated
with check (
  necessary = true
  and coalesce(length(anonymous_identifier), 0) >= 8
  and customer_id is null
  and auth_user_id is null
);

drop policy if exists "cookie_preferences_auth_insert" on public.cookie_preferences;
create policy "cookie_preferences_auth_insert"
on public.cookie_preferences for insert
to authenticated
with check (
  necessary = true
  and coalesce(length(anonymous_identifier), 0) >= 8
  and (
    auth_user_id = (select auth.uid())
    or exists (
      select 1 from public.store_customer_accounts a
      where a.customer_id = cookie_preferences.customer_id
        and a.company_id = cookie_preferences.company_id
        and a.auth_user_id = (select auth.uid())
        and a.status = 'active'
    )
  )
);

drop policy if exists "data_subject_requests_public_insert" on public.data_subject_requests;
create policy "data_subject_requests_public_insert"
on public.data_subject_requests for insert
to anon, authenticated
with check (
  status = 'recebida'
  and customer_id is null
  and auth_user_id is null
  and coalesce(length(requester_email), 0) >= 5
  and coalesce(length(request_details), 0) >= 10
);

drop policy if exists "data_subject_requests_self_insert" on public.data_subject_requests;
create policy "data_subject_requests_self_insert"
on public.data_subject_requests for insert
to authenticated
with check (
  status = 'recebida'
  and (
    auth_user_id = (select auth.uid())
    or exists (
      select 1 from public.store_customer_accounts a
      where a.customer_id = data_subject_requests.customer_id
        and a.company_id = data_subject_requests.company_id
        and a.auth_user_id = (select auth.uid())
        and a.status = 'active'
    )
  )
);

drop policy if exists "data_subject_requests_self_select" on public.data_subject_requests;
create policy "data_subject_requests_self_select"
on public.data_subject_requests for select
to authenticated
using (
  auth_user_id = (select auth.uid())
  or exists (
    select 1 from public.store_customer_accounts a
    where a.customer_id = data_subject_requests.customer_id
      and a.company_id = data_subject_requests.company_id
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
);

drop policy if exists "privacy_audit_events_auth_insert" on public.privacy_audit_events;
create policy "privacy_audit_events_auth_insert"
on public.privacy_audit_events for insert
to authenticated
with check (
  auth_user_id = (select auth.uid())
  or exists (
    select 1 from public.store_customer_accounts a
    where a.customer_id = privacy_audit_events.customer_id
      and a.company_id = privacy_audit_events.company_id
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
);

select pg_notify('pgrst', 'reload schema');
