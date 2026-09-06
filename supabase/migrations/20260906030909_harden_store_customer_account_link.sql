-- Harden Store account reconciliation so public identifiers such as CPF/CNPJ
-- are never accepted as proof that an authenticated user owns an existing
-- customer record. Existing records may only be linked through an existing
-- auth association or a confirmed Supabase Auth email match.

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
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_auth_email text;
  v_auth_email_confirmed boolean := false;
  v_normalized_document text := pg_catalog.regexp_replace(coalesce(p_document, ''), '\D', '', 'g');
  v_normalized_phone text := pg_catalog.regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_customer_id text;
  v_account_id text;
  v_account_status text;
  v_customer_auth_user_id uuid;
  v_candidate_ids text[];
  v_conflicting_account_user_id uuid;
  v_safe_name text;
  v_safe_document text := coalesce(nullif(pg_catalog.btrim(p_document), ''), '');
  v_safe_phone text := coalesce(nullif(pg_catalog.btrim(p_phone), ''), '');
  v_linked_existing boolean := false;
  v_original_jwt_claims text := pg_catalog.current_setting('request.jwt.claims', true);
  v_original_jwt_sub text := pg_catalog.current_setting('request.jwt.claim.sub', true);
begin
  if v_auth_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Sessao do cliente nao encontrada.';
  end if;

  select
    pg_catalog.lower(pg_catalog.btrim(coalesce(u.email, ''))),
    u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
  into v_auth_email, v_auth_email_confirmed
  from auth.users u
  where u.id = v_auth_user_id
  for share;

  if v_auth_email is null or v_auth_email = '' then
    raise exception using
      errcode = 'P0001',
      message = 'Sessao do cliente nao encontrada.';
  end if;

  if not private.company_matches_request_host(p_company_id) then
    raise exception using
      errcode = 'P0001',
      message = 'Nao foi possivel concluir o cadastro.';
  end if;

  v_safe_name := coalesce(
    nullif(pg_catalog.btrim(p_name), ''),
    v_auth_email,
    'Cliente do catalogo'
  );

  -- All callers acquire locks in the same order. The auth lock serializes
  -- retries from one session; email and document locks serialize competing
  -- reconciliation attempts before any ownership decision or write.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('store-account-auth:' || p_company_id || ':' || v_auth_user_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('store-account-email:' || p_company_id || ':' || v_auth_email, 0)
  );
  if pg_catalog.length(v_normalized_document) in (11, 14) then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('store-account-document:' || p_company_id || ':' || v_normalized_document, 0)
    );
  end if;

  select sca.customer_id, sca.id, sca.status, c.auth_user_id
  into v_customer_id, v_account_id, v_account_status, v_customer_auth_user_id
  from public.store_customer_accounts sca
  join public.customers c
    on c.id = sca.customer_id
   and c.company_id = sca.company_id
  where sca.company_id = p_company_id
    and sca.auth_user_id = v_auth_user_id
  order by sca.id
  limit 1
  for update of sca, c;

  if v_account_id is not null then
    if v_account_status is distinct from 'active'
       or v_customer_auth_user_id is distinct from v_auth_user_id then
      raise exception using
        errcode = 'P0001',
        message = 'Nao foi possivel concluir o cadastro.';
    end if;
  end if;

  -- Customer mutations are performed by this trusted definer on behalf of a
  -- Store identity, not by the tenant profile that auth provisioning may have
  -- created for the same UUID. Classify only these writes as SYSTEM for the
  -- global audit trigger, then restore the request identity before continuing.
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);

  if v_customer_id is null then
    select pg_catalog.array_agg(locked.id order by locked.id)
    into v_candidate_ids
    from (
      select c.id
      from public.customers c
      where c.company_id = p_company_id
        and c.auth_user_id = v_auth_user_id
      order by c.id
      limit 2
      for update
    ) locked;

    if coalesce(pg_catalog.cardinality(v_candidate_ids), 0) > 1 then
      raise exception using
        errcode = 'P0001',
        message = 'Nao foi possivel concluir o cadastro.';
    end if;
    v_customer_id := v_candidate_ids[1];
  end if;

  -- A confirmed email read directly from auth.users is the only automatic
  -- reconciliation proof for an existing, currently unlinked customer.
  if v_customer_id is null and v_auth_email_confirmed then
    select pg_catalog.array_agg(locked.id order by locked.id)
    into v_candidate_ids
    from (
      select c.id
      from public.customers c
      where c.company_id = p_company_id
        and pg_catalog.lower(pg_catalog.btrim(coalesce(c.email, ''))) = v_auth_email
      order by c.id
      limit 2
      for update
    ) locked;

    if coalesce(pg_catalog.cardinality(v_candidate_ids), 0) > 1 then
      raise exception using
        errcode = 'P0001',
        message = 'Nao foi possivel concluir o cadastro.';
    end if;
    v_customer_id := v_candidate_ids[1];

    if v_customer_id is not null then
      select c.auth_user_id
      into v_customer_auth_user_id
      from public.customers c
      where c.id = v_customer_id
        and c.company_id = p_company_id
      for update;

      if v_customer_auth_user_id is not null
         and v_customer_auth_user_id is distinct from v_auth_user_id then
        raise exception using
          errcode = 'P0001',
          message = 'Nao foi possivel concluir o cadastro.';
      end if;

      select sca.auth_user_id
      into v_conflicting_account_user_id
      from public.store_customer_accounts sca
      where sca.company_id = p_company_id
        and sca.customer_id = v_customer_id
      limit 1
      for update;

      if v_conflicting_account_user_id is not null
         and v_conflicting_account_user_id is distinct from v_auth_user_id then
        raise exception using
          errcode = 'P0001',
          message = 'Nao foi possivel concluir o cadastro.';
      end if;

      v_linked_existing := v_customer_auth_user_id is null;
    end if;
  end if;

  -- A matching document is only a conflict check. It never selects the
  -- customer that will be linked.
  if pg_catalog.length(v_normalized_document) in (11, 14) then
    select pg_catalog.array_agg(locked.id order by locked.id)
    into v_candidate_ids
    from (
      select c.id
      from public.customers c
      where c.company_id = p_company_id
        and pg_catalog.regexp_replace(coalesce(c.document, ''), '\D', '', 'g') = v_normalized_document
      order by c.id
      limit 2
      for update
    ) locked;

    if coalesce(pg_catalog.cardinality(v_candidate_ids), 0) > 0
       and (
         v_customer_id is null
         or not (v_customer_id = any(v_candidate_ids))
       ) then
      raise exception using
        errcode = 'P0001',
        message = 'Nao foi possivel concluir o cadastro.';
    end if;
  end if;

  if v_customer_id is null then
    insert into public.customers (
      company_id, auth_user_id, customer_type, name, legal_name, trade_name,
      document, email, phone, whatsapp, birth_date, contact_preference,
      address, tags, notes, privacy_accepted_at, privacy_policy_version,
      terms_accepted_at, terms_version
    ) values (
      p_company_id,
      v_auth_user_id,
      case when p_customer_type = 'juridica' then 'juridica' else 'fisica' end,
      v_safe_name,
      v_safe_name,
      nullif(pg_catalog.btrim(coalesce(p_trade_name, '')), ''),
      v_safe_document,
      v_auth_email,
      v_safe_phone,
      coalesce(nullif(pg_catalog.btrim(coalesce(p_whatsapp, '')), ''), v_safe_phone),
      p_birth_date,
      coalesce(p_contact_preference, 'whatsapp'),
      '{}'::jsonb,
      array['Catalogo Online'],
      'Conta vinculada pelo cliente final no catalogo publico.',
      pg_catalog.now(),
      p_privacy_policy_version,
      pg_catalog.now(),
      p_terms_version
    )
    returning id into v_customer_id;
  else
    update public.customers c
    set auth_user_id = v_auth_user_id,
        customer_type = case when p_customer_type = 'juridica' then 'juridica' else coalesce(c.customer_type, 'fisica') end,
        name = coalesce(nullif(pg_catalog.btrim(p_name), ''), c.name, v_safe_name),
        legal_name = coalesce(nullif(pg_catalog.btrim(p_name), ''), c.legal_name, c.name, v_safe_name),
        trade_name = coalesce(nullif(pg_catalog.btrim(coalesce(p_trade_name, '')), ''), c.trade_name),
        document = case when pg_catalog.length(v_normalized_document) in (11, 14) then p_document else c.document end,
        email = v_auth_email,
        phone = coalesce(nullif(pg_catalog.btrim(coalesce(p_phone, '')), ''), c.phone),
        whatsapp = coalesce(nullif(pg_catalog.btrim(coalesce(p_whatsapp, p_phone, '')), ''), c.whatsapp),
        birth_date = coalesce(p_birth_date, c.birth_date),
        contact_preference = coalesce(p_contact_preference, c.contact_preference),
        privacy_accepted_at = coalesce(c.privacy_accepted_at, pg_catalog.now()),
        privacy_policy_version = coalesce(c.privacy_policy_version, p_privacy_policy_version),
        terms_accepted_at = coalesce(c.terms_accepted_at, pg_catalog.now()),
        terms_version = coalesce(c.terms_version, p_terms_version),
        updated_at = pg_catalog.now()
    where c.id = v_customer_id
      and c.company_id = p_company_id
      and (c.auth_user_id is null or c.auth_user_id = v_auth_user_id)
    returning c.auth_user_id into v_customer_auth_user_id;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'Nao foi possivel concluir o cadastro.';
    end if;
  end if;

  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_original_jwt_claims, ''), true);
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_original_jwt_sub, ''), true);

  insert into public.store_customer_accounts (
    company_id, customer_id, auth_user_id, status
  ) values (
    p_company_id, v_customer_id, v_auth_user_id, 'active'
  )
  on conflict (company_id, auth_user_id)
  do update set
    status = 'active',
    updated_at = pg_catalog.now()
  where public.store_customer_accounts.customer_id = excluded.customer_id
  returning id into v_account_id;

  if v_account_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Nao foi possivel concluir o cadastro.';
  end if;

  if pg_catalog.to_regclass('public.customer_consents') is not null then
    insert into public.customer_consents (
      company_id, customer_id, auth_user_id, consent_type, granted,
      policy_version, source, granted_at, revoked_at
    ) values
      (p_company_id, v_customer_id, v_auth_user_id, 'privacy_policy', true, p_privacy_policy_version, 'store_signup', pg_catalog.now(), null),
      (p_company_id, v_customer_id, v_auth_user_id, 'terms_of_use', true, p_terms_version, 'store_signup', pg_catalog.now(), null),
      (p_company_id, v_customer_id, v_auth_user_id, 'marketing_email', coalesce(p_marketing_email_granted, false), p_privacy_policy_version, 'store_signup', case when coalesce(p_marketing_email_granted, false) then pg_catalog.now() else null end, case when coalesce(p_marketing_email_granted, false) then null else pg_catalog.now() end),
      (p_company_id, v_customer_id, v_auth_user_id, 'marketing_whatsapp', coalesce(p_marketing_whatsapp_granted, false), p_privacy_policy_version, 'store_signup', case when coalesce(p_marketing_whatsapp_granted, false) then pg_catalog.now() else null end, case when coalesce(p_marketing_whatsapp_granted, false) then null else pg_catalog.now() end);
  end if;

  if pg_catalog.to_regclass('public.privacy_audit_events') is not null then
    insert into public.privacy_audit_events (
      company_id, customer_id, auth_user_id, event_type, event_details, source
    ) values (
      p_company_id,
      v_customer_id,
      v_auth_user_id,
      'store_customer_account_ensured',
      pg_catalog.jsonb_build_object(
        'privacy_policy_version', p_privacy_policy_version,
        'terms_version', p_terms_version,
        'document_available', pg_catalog.length(v_normalized_document) in (11, 14),
        'phone_available', pg_catalog.length(v_normalized_phone) >= 10
      ),
      'store_signup'
    );
  end if;

  if v_linked_existing and pg_catalog.to_regclass('public.audit_logs') is not null then
    insert into public.audit_logs (
      company_id, actor_user_id, actor_profile_id, actor_name, actor_role,
      action, entity_type, entity_id, module, old_values, new_values, metadata
    ) values (
      p_company_id,
      v_auth_user_id,
      null,
      'Cliente da Store',
      'store_customer',
      'customer.store_account_linked',
      'customers',
      v_customer_id,
      'customers',
      pg_catalog.jsonb_build_object('store_account_linked', false),
      pg_catalog.jsonb_build_object('store_account_linked', true),
      pg_catalog.jsonb_build_object(
        'source', 'store_signup',
        'identity_proof', 'confirmed_auth_email'
      )
    );
  end if;

  return query select v_account_id, v_customer_id;
end;
$$;

revoke all on function public.ensure_store_customer_account(
  text, text, text, text, text, text, text, date, text, text, text, boolean, boolean
) from public, anon;

grant execute on function public.ensure_store_customer_account(
  text, text, text, text, text, text, text, date, text, text, text, boolean, boolean
) to authenticated;

-- A historical ten-argument overload can exist after a full local replay.
-- No current caller uses it; remove the alternate path instead of leaving
-- vulnerable legacy code installed but merely ungranted.
drop function if exists public.ensure_store_customer_account(
  text, text, text, text, text, text, text, date, text, text
);

select pg_catalog.pg_notify('pgrst', 'reload schema');
