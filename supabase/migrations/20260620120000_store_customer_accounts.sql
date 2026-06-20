-- PRINTFLOWPRO - Public store customer accounts
-- Adds final-customer auth/account data without mixing it with ERP profiles.

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

drop trigger if exists set_timestamp_store_customer_accounts on public.store_customer_accounts;
create trigger set_timestamp_store_customer_accounts
before update on public.store_customer_accounts
for each row execute procedure trigger_set_timestamp();

drop trigger if exists set_timestamp_customer_addresses on public.customer_addresses;
create trigger set_timestamp_customer_addresses
before update on public.customer_addresses
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

create or replace function private.request_host()
returns text
language sql
stable
as $$
  select lower(
    coalesce(
      nullif(current_setting('request.headers', true)::jsonb ->> 'host', ''),
      nullif(regexp_replace(current_setting('request.headers', true)::jsonb ->> 'origin', '^https?://([^/]+).*$','\1'), ''),
      nullif(regexp_replace(current_setting('request.headers', true)::jsonb ->> 'referer', '^https?://([^/]+).*$','\1'), '')
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
        or private.request_host() like ('store.%' || lower(regexp_replace(c.name, '[^a-zA-Z0-9]+', '', 'g')) || '%')
      )
  )
$$;

revoke all on function private.current_store_customer_id() from public;
revoke all on function private.current_store_company_id() from public;
revoke all on function private.company_matches_request_host(text) from public;
grant execute on function private.current_store_customer_id() to authenticated;
grant execute on function private.current_store_company_id() to authenticated;

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
  p_privacy_policy_version text default '2026-06'
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
  current_auth_user uuid := auth.uid();
  current_email text := coalesce((auth.jwt() ->> 'email'), '');
  normalized_document text := regexp_replace(coalesce(p_document, ''), '\D', '', 'g');
  resolved_customer_id text;
  resolved_account_id text;
begin
  if current_auth_user is null then
    raise exception 'Sessao do cliente nao encontrada.';
  end if;

  if not private.company_matches_request_host(p_company_id) then
    raise exception 'Loja invalida para este dominio.';
  end if;

  if length(normalized_document) not in (11, 14) then
    raise exception 'CPF ou CNPJ invalido.';
  end if;

  select customer_id, id
    into resolved_customer_id, resolved_account_id
  from public.store_customer_accounts
  where company_id = p_company_id
    and auth_user_id = current_auth_user
  limit 1;

  if resolved_customer_id is null then
    select id
      into resolved_customer_id
    from public.customers
    where company_id = p_company_id
      and regexp_replace(coalesce(document, ''), '\D', '', 'g') = normalized_document
    limit 1;
  end if;

  if resolved_customer_id is null then
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
      current_auth_user,
      case when p_customer_type = 'juridica' then 'juridica' else 'fisica' end,
      nullif(trim(p_name), ''),
      nullif(trim(p_name), ''),
      nullif(trim(coalesce(p_trade_name, '')), ''),
      p_document,
      current_email,
      p_phone,
      coalesce(p_whatsapp, p_phone),
      p_birth_date,
      coalesce(p_contact_preference, 'whatsapp'),
      '{}'::jsonb,
      array['Catalogo Online'],
      'Conta criada pelo cliente final no catalogo publico.',
      now(),
      p_privacy_policy_version,
      now(),
      p_privacy_policy_version
    )
    returning id into resolved_customer_id;
  else
    update public.customers
    set auth_user_id = current_auth_user,
        customer_type = case when p_customer_type = 'juridica' then 'juridica' else 'fisica' end,
        name = coalesce(nullif(trim(p_name), ''), name),
        legal_name = coalesce(nullif(trim(p_name), ''), legal_name),
        trade_name = coalesce(nullif(trim(coalesce(p_trade_name, '')), ''), trade_name),
        email = current_email,
        phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone),
        whatsapp = coalesce(nullif(trim(coalesce(p_whatsapp, p_phone, '')), ''), whatsapp),
        birth_date = coalesce(p_birth_date, birth_date),
        contact_preference = coalesce(p_contact_preference, contact_preference),
        privacy_accepted_at = coalesce(privacy_accepted_at, now()),
        privacy_policy_version = coalesce(privacy_policy_version, p_privacy_policy_version),
        updated_at = now()
    where id = resolved_customer_id
      and company_id = p_company_id;
  end if;

  insert into public.store_customer_accounts (company_id, customer_id, auth_user_id, status)
  values (p_company_id, resolved_customer_id, current_auth_user, 'active')
  on conflict (company_id, auth_user_id)
  do update set customer_id = excluded.customer_id, status = 'active', updated_at = now()
  returning id into resolved_account_id;

  return query select resolved_account_id, resolved_customer_id;
end;
$$;

revoke all on function public.ensure_store_customer_account(
  text, text, text, text, text, text, text, date, text, text
) from public;
grant execute on function public.ensure_store_customer_account(
  text, text, text, text, text, text, text, date, text, text
) to authenticated;

alter table public.store_customer_accounts enable row level security;
alter table public.customer_addresses enable row level security;

grant select, insert, update, delete on public.store_customer_accounts, public.customer_addresses to authenticated;

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

drop policy if exists "store_orders_self_select" on public.orders;
create policy "store_orders_self_select"
on public.orders for select
to authenticated
using (
  exists (
    select 1 from public.store_customer_accounts a
    where a.customer_id = orders.customer_id
      and a.company_id = orders.company_id
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
);

drop policy if exists "store_order_items_self_select" on public.order_items;
create policy "store_order_items_self_select"
on public.order_items for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    join public.store_customer_accounts a
      on a.customer_id = o.customer_id
     and a.company_id = o.company_id
    where o.id = order_items.order_id
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
);

drop policy if exists "store_quotes_self_select" on public.quotes;
create policy "store_quotes_self_select"
on public.quotes for select
to authenticated
using (
  exists (
    select 1 from public.store_customer_accounts a
    where a.customer_id = quotes.customer_id
      and a.company_id = quotes.company_id
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
);

drop policy if exists "store_quotes_self_insert" on public.quotes;
create policy "store_quotes_self_insert"
on public.quotes for insert
to authenticated
with check (
  status = 'pendente'
  and exists (
    select 1 from public.store_customer_accounts a
    where a.customer_id = quotes.customer_id
      and a.company_id = quotes.company_id
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
);

drop policy if exists "store_quote_items_self_select" on public.quote_items;
create policy "store_quote_items_self_select"
on public.quote_items for select
to authenticated
using (
  exists (
    select 1
    from public.quotes q
    join public.store_customer_accounts a
      on a.customer_id = q.customer_id
     and a.company_id = q.company_id
    where q.id = quote_items.quote_id
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
);

drop policy if exists "store_quote_items_self_insert" on public.quote_items;
create policy "store_quote_items_self_insert"
on public.quote_items for insert
to authenticated
with check (
  exists (
    select 1
    from public.quotes q
    join public.store_customer_accounts a
      on a.customer_id = q.customer_id
     and a.company_id = q.company_id
    where q.id = quote_items.quote_id
      and q.status = 'pendente'
      and a.auth_user_id = (select auth.uid())
      and a.status = 'active'
  )
);
