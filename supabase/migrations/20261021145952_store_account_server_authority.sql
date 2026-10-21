-- Additive rollout: deploy the server caller before the separate legacy-grant
-- cutover. Reuse the H1 implementation rather than copying its ownership logic.
create or replace function public.ensure_store_customer_account_from_server(
  p_store_hostname text,
  p_actor_user_id uuid,
  p_profile jsonb
)
returns table (account_id text, customer_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_ids text[];
  v_claims text := pg_catalog.current_setting('request.jwt.claims', true);
  v_sub text := pg_catalog.current_setting('request.jwt.claim.sub', true);
  v_headers text := pg_catalog.current_setting('request.headers', true);
begin
  if coalesce(v_claims, '{}')::jsonb ->> 'role' is distinct from 'service_role'
     or p_actor_user_id is null
     or p_store_hostname is null
     or p_store_hostname !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
     or pg_catalog.length(p_store_hostname) > 253
     or p_store_hostname in ('localhost', '127.0.0.1', '0.0.0.0')
     or p_profile is null or pg_catalog.jsonb_typeof(p_profile) <> 'object'
  then
    raise exception using errcode = 'P0001', message = 'Nao foi possivel concluir o cadastro.';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_object_keys(p_profile) as field(name)
    where field.name <> all(array[
      'p_name','p_customer_type','p_document','p_phone','p_whatsapp','p_trade_name',
      'p_birth_date','p_contact_preference','p_privacy_policy_version','p_terms_version',
      'p_marketing_email_granted','p_marketing_whatsapp_granted'
    ])
  ) then
    raise exception using errcode = 'P0001', message = 'Nao foi possivel concluir o cadastro.';
  end if;

  -- The service-only boundary accepts a canonical host, never a company id.
  -- Resolve and lock the configuration again in the mutation transaction.
  select pg_catalog.array_agg(candidate.id order by candidate.id)
  into v_company_ids
  from (
    select c.id from public.companies c
    where p_store_hostname in (c.store_domain, c.custom_domain, c.admin_domain)
    order by c.id limit 2 for share
  ) candidate;
  if coalesce(pg_catalog.cardinality(v_company_ids), 0) <> 1 then
    raise exception using errcode = 'P0001', message = 'Nao foi possivel concluir o cadastro.';
  end if;

  -- Actor came from Auth.getUser at the server boundary. The existing core
  -- still validates auth.uid() against auth.users and confirmed email itself.
  perform pg_catalog.set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
    'sub', p_actor_user_id, 'role', 'authenticated'
  )::text, true);
  -- Replace (do not merge) untrusted inbound headers for the legacy core check.
  perform pg_catalog.set_config('request.headers', pg_catalog.jsonb_build_object(
    'host', p_store_hostname, 'origin', 'https://' || p_store_hostname
  )::text, true);

  return query select * from public.ensure_store_customer_account(
    v_company_ids[1], p_profile ->> 'p_name', p_profile ->> 'p_customer_type',
    p_profile ->> 'p_document', p_profile ->> 'p_phone',
    p_profile ->> 'p_whatsapp', p_profile ->> 'p_trade_name',
    nullif(p_profile ->> 'p_birth_date', '')::date,
    coalesce(p_profile ->> 'p_contact_preference', 'whatsapp'),
    coalesce(p_profile ->> 'p_privacy_policy_version', '2026-06'),
    coalesce(p_profile ->> 'p_terms_version', '2026-06'),
    coalesce((p_profile ->> 'p_marketing_email_granted')::boolean, false),
    coalesce((p_profile ->> 'p_marketing_whatsapp_granted')::boolean, false)
  );
  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform pg_catalog.set_config('request.headers', coalesce(v_headers, ''), true);
exception when others then
  -- Subtransaction rollback also restores claim changes and partial writes.
  raise exception using errcode = 'P0001', message = 'Nao foi possivel concluir o cadastro.';
end;
$$;

revoke all on function public.ensure_store_customer_account_from_server(text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.ensure_store_customer_account_from_server(text, uuid, jsonb)
  to service_role;
select pg_catalog.pg_notify('pgrst', 'reload schema');
