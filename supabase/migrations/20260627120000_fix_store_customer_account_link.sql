-- PRINTFLOWPRO - restore final-customer account tables and linking.
-- Additive and idempotent: creates missing store account/address structures without deleting data.

create schema if not exists private;

alter table public.customers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists customer_type text default 'fisica' check (customer_type in ('fisica', 'juridica')),
  add column if not exists legal_name text,
  add column if not exists trade_name text,
  add column if not exists whatsapp text,
  add column if not exists birth_date date,
  add column if not exists contact_preference text default 'whatsapp' check (contact_preference in ('whatsapp', 'email', 'telefone')),
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists privacy_policy_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

create unique index if not exists idx_customers_company_auth_user_id
  on public.customers(company_id, auth_user_id)
  where auth_user_id is not null;

create unique index if not exists idx_customers_company_document_clean
  on public.customers(company_id, regexp_replace(coalesce(document, ''), '\D', '', 'g'))
  where coalesce(document, '') <> '';

create table if not exists public.store_customer_accounts (
  id text primary key default (gen_random_uuid()::text),
  company_id text not null references public.companies(id) on delete cascade,
  customer_id text not null references public.customers(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'blocked', 'pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, auth_user_id),
  unique (company_id, customer_id)
);

create table if not exists public.customer_addresses (
  id text primary key default (gen_random_uuid()::text),
  company_id text not null references public.companies(id) on delete cascade,
  customer_id text not null references public.customers(id) on delete cascade,
  label text not null default 'Casa',
  recipient_name text,
  zip_code text not null,
  street text not null,
  number text not null,
  complement text,
  neighborhood text not null,
  city text not null,
  state text not null,
  reference text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_store_customer_accounts_auth
  on public.store_customer_accounts(auth_user_id, company_id);
create index if not exists idx_store_customer_accounts_customer
  on public.store_customer_accounts(customer_id, company_id);
create index if not exists idx_customer_addresses_customer
  on public.customer_addresses(customer_id, company_id);
create unique index if not exists idx_customer_addresses_one_default
  on public.customer_addresses(company_id, customer_id)
  where is_default = true;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'trigger_set_timestamp'
  ) then
    drop trigger if exists set_timestamp_store_customer_accounts on public.store_customer_accounts;
    create trigger set_timestamp_store_customer_accounts
    before update on public.store_customer_accounts
    for each row execute procedure public.trigger_set_timestamp();

    drop trigger if exists set_timestamp_customer_addresses on public.customer_addresses;
    create trigger set_timestamp_customer_addresses
    before update on public.customer_addresses
    for each row execute procedure public.trigger_set_timestamp();
  end if;
end;
$$;

create or replace function private.request_host()
returns text
language sql
stable
as $$
  select lower(
    coalesce(
      nullif(regexp_replace(current_setting('request.headers', true)::jsonb ->> 'origin', '^https?://([^/]+).*$','\1'), ''),
      nullif(regexp_replace(current_setting('request.headers', true)::jsonb ->> 'referer', '^https?://([^/]+).*$','\1'), ''),
      nullif(current_setting('request.headers', true)::jsonb ->> 'host', '')
    )
  )
$$;

create or replace function private.company_matches_request_host(target_company_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.companies c
    where c.id = target_company_id
      and (
        private.request_host() is null
        or private.request_host() = ''
        or private.request_host() like 'localhost:%'
        or private.request_host() like '127.0.0.1:%'
        or regexp_replace(lower(coalesce(c.store_domain, '')), '^https?://', '') = private.request_host()
        or regexp_replace(lower(coalesce(c.custom_domain, '')), '^https?://', '') = private.request_host()
        or regexp_replace(lower(coalesce(c.admin_domain, '')), '^https?://', '') = private.request_host()
      )
  )
$$;

revoke all on function private.company_matches_request_host(text) from public;

alter table public.store_customer_accounts enable row level security;
alter table public.customer_addresses enable row level security;

grant select on public.store_customer_accounts to authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;

drop policy if exists "store_accounts_self_select" on public.store_customer_accounts;
create policy "store_accounts_self_select"
on public.store_customer_accounts for select
to authenticated
using (auth_user_id = (select auth.uid()));

drop policy if exists "store_customers_self_select" on public.customers;
create policy "store_customers_self_select"
on public.customers for select
to authenticated
using (
  exists (
    select 1 from public.store_customer_accounts a
    where a.customer_id = customers.id
      and a.company_id = customers.company_id
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
);

drop policy if exists "store_customers_self_update" on public.customers;
create policy "store_customers_self_update"
on public.customers for update
to authenticated
using (
  exists (
    select 1 from public.store_customer_accounts a
    where a.customer_id = customers.id
      and a.company_id = customers.company_id
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.store_customer_accounts a
    where a.customer_id = customers.id
      and a.company_id = customers.company_id
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
);

drop policy if exists "store_addresses_self_all" on public.customer_addresses;
create policy "store_addresses_self_all"
on public.customer_addresses for all
to authenticated
using (
  exists (
    select 1 from public.store_customer_accounts a
    where a.customer_id = customer_addresses.customer_id
      and a.company_id = customer_addresses.company_id
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.store_customer_accounts a
    where a.customer_id = customer_addresses.customer_id
      and a.company_id = customer_addresses.company_id
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
);

create or replace function public.ensure_store_customer_account(
  p_company_id text,
  p_name text,
  p_customer_type text,
  p_document text,
  p_phone text,
  p_whatsapp text default null,
  p_trade_name text default null,
  p_birth_date date default null,
  p_contact_preference text default 'whatsapp',
  p_privacy_policy_version text default '2026-06',
  p_terms_version text default '2026-06',
  p_marketing_email_granted boolean default false,
  p_marketing_whatsapp_granted boolean default false
)
returns table (
  account_id text,
  customer_id text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_customer_email text := lower(trim(coalesce((auth.jwt() ->> 'email'), '')));
  v_normalized_document text := regexp_replace(coalesce(p_document, ''), '\D', '', 'g');
  v_normalized_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_customer_id text;
  v_account_id text;
  v_safe_name text := coalesce(nullif(trim(p_name), ''), nullif(v_customer_email, ''), 'Cliente do catalogo');
  v_safe_document text := coalesce(nullif(trim(p_document), ''), '');
  v_safe_phone text := coalesce(nullif(trim(p_phone), ''), '');
begin
  if v_auth_user_id is null then
    raise exception 'Sessao do cliente nao encontrada.';
  end if;

  if not private.company_matches_request_host(p_company_id) then
    raise exception 'Loja invalida para este dominio.';
  end if;

  select sca.customer_id, sca.id
    into v_customer_id, v_account_id
  from public.store_customer_accounts sca
  where sca.company_id = p_company_id
    and sca.auth_user_id = v_auth_user_id
  limit 1;

  if v_customer_id is null then
    select c.id
      into v_customer_id
    from public.customers c
    where c.company_id = p_company_id
      and c.auth_user_id = v_auth_user_id
    limit 1;
  end if;

  if v_customer_id is null and length(v_normalized_document) in (11, 14) then
    select c.id
      into v_customer_id
    from public.customers c
    where c.company_id = p_company_id
      and regexp_replace(coalesce(c.document, ''), '\D', '', 'g') = v_normalized_document
    limit 1;
  end if;

  if v_customer_id is null and v_customer_email <> '' then
    select c.id
      into v_customer_id
    from public.customers c
    where c.company_id = p_company_id
      and lower(trim(coalesce(c.email, ''))) = v_customer_email
    order by c.created_at asc
    limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (
      company_id,
      auth_user_id,
      customer_type,
      name,
      legal_name,
      trade_name,
      document,
      email,
      phone,
      whatsapp,
      birth_date,
      contact_preference,
      address,
      tags,
      notes,
      privacy_accepted_at,
      privacy_policy_version,
      terms_accepted_at,
      terms_version
    )
    values (
      p_company_id,
      v_auth_user_id,
      case when p_customer_type = 'juridica' then 'juridica' else 'fisica' end,
      v_safe_name,
      v_safe_name,
      nullif(trim(coalesce(p_trade_name, '')), ''),
      v_safe_document,
      nullif(v_customer_email, ''),
      v_safe_phone,
      coalesce(nullif(trim(coalesce(p_whatsapp, '')), ''), v_safe_phone),
      p_birth_date,
      coalesce(p_contact_preference, 'whatsapp'),
      '{}'::jsonb,
      array['Catalogo Online'],
      'Conta vinculada pelo cliente final no catalogo publico.',
      now(),
      p_privacy_policy_version,
      now(),
      p_terms_version
    )
    returning id into v_customer_id;
  else
    update public.customers c
    set auth_user_id = v_auth_user_id,
        customer_type = case when p_customer_type = 'juridica' then 'juridica' else coalesce(c.customer_type, 'fisica') end,
        name = coalesce(nullif(trim(p_name), ''), c.name, v_safe_name),
        legal_name = coalesce(nullif(trim(p_name), ''), c.legal_name, c.name, v_safe_name),
        trade_name = coalesce(nullif(trim(coalesce(p_trade_name, '')), ''), c.trade_name),
        document = case
          when length(v_normalized_document) in (11, 14) then p_document
          else c.document
        end,
        email = coalesce(nullif(v_customer_email, ''), c.email),
        phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), c.phone),
        whatsapp = coalesce(nullif(trim(coalesce(p_whatsapp, p_phone, '')), ''), c.whatsapp),
        birth_date = coalesce(p_birth_date, c.birth_date),
        contact_preference = coalesce(p_contact_preference, c.contact_preference),
        privacy_accepted_at = coalesce(c.privacy_accepted_at, now()),
        privacy_policy_version = coalesce(c.privacy_policy_version, p_privacy_policy_version),
        terms_accepted_at = coalesce(c.terms_accepted_at, now()),
        terms_version = coalesce(c.terms_version, p_terms_version),
        updated_at = now()
    where c.id = v_customer_id
      and c.company_id = p_company_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'store_customer_accounts'
      and column_name = 'status'
  ) then
    execute
      'insert into public.store_customer_accounts (company_id, customer_id, auth_user_id, status)
       values ($1, $2, $3, ''active'')
       on conflict (company_id, auth_user_id)
       do update set customer_id = excluded.customer_id, status = ''active'', updated_at = now()
       returning id'
    into v_account_id
    using p_company_id, v_customer_id, v_auth_user_id;
  else
    insert into public.store_customer_accounts (company_id, customer_id, auth_user_id)
    values (p_company_id, v_customer_id, v_auth_user_id)
    on conflict (company_id, auth_user_id)
    do update set customer_id = excluded.customer_id, updated_at = now()
    returning id into v_account_id;
  end if;

  if to_regclass('public.customer_consents') is not null then
    insert into public.customer_consents (
      company_id, customer_id, auth_user_id, consent_type, granted, policy_version, source, granted_at, revoked_at
    )
    values
      (p_company_id, v_customer_id, v_auth_user_id, 'privacy_policy', true, p_privacy_policy_version, 'store_signup', now(), null),
      (p_company_id, v_customer_id, v_auth_user_id, 'terms_of_use', true, p_terms_version, 'store_signup', now(), null),
      (p_company_id, v_customer_id, v_auth_user_id, 'marketing_email', coalesce(p_marketing_email_granted, false), p_privacy_policy_version, 'store_signup', case when coalesce(p_marketing_email_granted, false) then now() else null end, case when coalesce(p_marketing_email_granted, false) then null else now() end),
      (p_company_id, v_customer_id, v_auth_user_id, 'marketing_whatsapp', coalesce(p_marketing_whatsapp_granted, false), p_privacy_policy_version, 'store_signup', case when coalesce(p_marketing_whatsapp_granted, false) then now() else null end, case when coalesce(p_marketing_whatsapp_granted, false) then null else now() end);
  end if;

  if to_regclass('public.privacy_audit_events') is not null then
    insert into public.privacy_audit_events (
      company_id, customer_id, auth_user_id, event_type, event_details, source
    )
    values (
      p_company_id,
      v_customer_id,
      v_auth_user_id,
      'store_customer_account_ensured',
      jsonb_build_object(
        'privacy_policy_version', p_privacy_policy_version,
        'terms_version', p_terms_version,
        'document_available', length(v_normalized_document) in (11, 14),
        'phone_available', length(v_normalized_phone) >= 10
      ),
      'store_signup'
    );
  end if;

  return query select v_account_id, v_customer_id;
end;
$$;

revoke all on function public.ensure_store_customer_account(
  text, text, text, text, text, text, text, date, text, text, text, boolean, boolean
) from public;
grant execute on function public.ensure_store_customer_account(
  text, text, text, text, text, text, text, date, text, text, text, boolean, boolean
) to authenticated;

select pg_notify('pgrst', 'reload schema');
