begin;
select plan(33);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('46000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'usuario-b@example.test', '', now(), '{}'::jsonb, '{"name":"Store User B","company_name":"Store Link Tenant A"}'::jsonb, now(), now()),
  ('46000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'cliente-a@example.test', '', now(), '{}'::jsonb, '{"name":"Store User A"}'::jsonb, now(), now()),
  ('46000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'linked-owner@example.test', '', now(), '{}'::jsonb, '{"name":"Linked Owner"}'::jsonb, now(), now()),
  ('46000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'new-store-user@example.test', '', now(), '{}'::jsonb, '{"name":"New Store User"}'::jsonb, now(), now()),
  ('46000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'tenant-b-user@example.test', '', now(), '{}'::jsonb, '{"name":"Tenant B User","company_name":"Store Link Tenant B"}'::jsonb, now(), now()),
  ('46000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'unconfirmed@example.test', '', null, '{}'::jsonb, '{"name":"Unconfirmed User"}'::jsonb, now(), now());

create temporary table store_link_test_tenants (
  tenant_a text not null,
  tenant_b text not null
) on commit drop;

insert into store_link_test_tenants(tenant_a, tenant_b)
select
  (select company_id from public.profiles where auth_user_id = '46000000-0000-0000-0000-000000000001'),
  (select company_id from public.profiles where auth_user_id = '46000000-0000-0000-0000-000000000005');

grant select on store_link_test_tenants to authenticated;

update public.companies
set store_domain = case
  when id = (select tenant_a from store_link_test_tenants) then 'store-link-a.example.test'
  else 'store-link-b.example.test'
end
where id in (
  (select tenant_a from store_link_test_tenants),
  (select tenant_b from store_link_test_tenants)
);

insert into public.customers (
  id, company_id, auth_user_id, name, document, phone, email, address, tags, notes
) values
  ('store-link-existing-a', (select tenant_a from store_link_test_tenants), null, 'Existing A', '111.222.333-44', '71999990001', 'cliente-a@example.test', '{}'::jsonb, '{}', ''),
  ('store-link-owned', (select tenant_a from store_link_test_tenants), '46000000-0000-0000-0000-000000000003', 'Already Owned', '55.666.777/0001-88', '71999990002', 'linked-owner@example.test', '{}'::jsonb, '{}', ''),
  ('store-link-unconfirmed', (select tenant_a from store_link_test_tenants), null, 'Unconfirmed Match', '999.888.777-66', '71999990003', 'unconfirmed@example.test', '{}'::jsonb, '{}', ''),
  ('store-link-tenant-b', (select tenant_b from store_link_test_tenants), null, 'Tenant B Customer', '222.333.444-55', '71999990004', 'tenant-b-customer@example.test', '{}'::jsonb, '{}', '');

insert into public.store_customer_accounts(company_id, customer_id, auth_user_id, status)
values ((select tenant_a from store_link_test_tenants), 'store-link-owned', '46000000-0000-0000-0000-000000000003', 'active');

select has_function(
  'public',
  'ensure_store_customer_account',
  array['text','text','text','text','text','text','text','date','text','text','text','boolean','boolean']
);
select is_definer(
  'public',
  'ensure_store_customer_account',
  array['text','text','text','text','text','text','text','date','text','text','text','boolean','boolean']
);
select function_privs_are(
  'public', 'ensure_store_customer_account',
  array['text','text','text','text','text','text','text','date','text','text','text','boolean','boolean'],
  'authenticated', array['EXECUTE']
);
select function_privs_are(
  'public', 'ensure_store_customer_account',
  array['text','text','text','text','text','text','text','date','text','text','text','boolean','boolean'],
  'anon', array[]::text[]
);
select function_privs_are(
  'public', 'ensure_store_customer_account',
  array['text','text','text','text','text','text','text','date','text','text','text','boolean','boolean'],
  'public', array[]::text[]
);
select hasnt_function(
  'public',
  'ensure_store_customer_account',
  array['text','text','text','text','text','text','text','date','text','text'],
  'historical ten-argument overload is removed'
);
select is(
  (select p.proconfig from pg_proc p where p.oid = 'public.ensure_store_customer_account(text,text,text,text,text,text,text,date,text,text,text,boolean,boolean)'::regprocedure),
  array['search_path=""']::text[],
  'security definer pins an empty search_path'
);
select ok(
  (select pg_get_functiondef('public.ensure_store_customer_account(text,text,text,text,text,text,text,date,text,text,text,boolean,boolean)'::regprocedure)) ilike '%from auth.users%',
  'authenticated email is read server-side from auth.users'
);
select ok(
  (select pg_get_function_arguments('public.ensure_store_customer_account(text,text,text,text,text,text,text,date,text,text,text,boolean,boolean)'::regprocedure)) not ilike '%auth_user_id%',
  'browser cannot provide actor auth_user_id'
);

select set_config('request.headers', '{"origin":"https://store-link-a.example.test"}', true);
select set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-000000000001","role":"authenticated","email":"spoofed@example.test"}', true);
set local role authenticated;

select throws_ok(
  format(
    'select * from public.ensure_store_customer_account(%L,%L,%L,%L,%L,null,null,null::date,''whatsapp'',''2026-06'',''2026-06'',false,false)',
    (select tenant_a from store_link_test_tenants), 'Attacker', 'fisica', '11122233344', '71999999999'
  ),
  'P0001',
  'Nao foi possivel concluir o cadastro.',
  'known document with a different authenticated email is rejected without enumeration'
);

reset role;
select is((select auth_user_id from public.customers where id = 'store-link-existing-a'), null::uuid, 'known document never changes the original customer auth_user_id');
select is((select count(*)::integer from public.store_customer_accounts where customer_id = 'store-link-existing-a'), 0, 'rejected document creates no Store account');

select set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  format(
    'select * from public.ensure_store_customer_account(%L,%L,%L,%L,%L,null,null,null::date,''whatsapp'',''2026-06'',''2026-06'',false,false)',
    (select tenant_a from store_link_test_tenants), 'Existing A', 'fisica', '11122233344', '71999990001'
  ),
  'confirmed auth email may reconcile the matching unlinked customer'
);
reset role;

select is((select auth_user_id from public.customers where id = 'store-link-existing-a'), '46000000-0000-0000-0000-000000000002'::uuid, 'positive reconciliation links the confirmed auth identity');
select is((select count(*)::integer from public.store_customer_accounts where customer_id = 'store-link-existing-a' and auth_user_id = '46000000-0000-0000-0000-000000000002'), 1, 'positive reconciliation creates exactly one Store account');
select is((select count(*)::integer from public.audit_logs where action = 'customer.store_account_linked' and entity_id = 'store-link-existing-a'), 1, 'legitimate existing-customer link is audited once');
select is((select metadata ->> 'identity_proof' from public.audit_logs where action = 'customer.store_account_linked' and entity_id = 'store-link-existing-a'), 'confirmed_auth_email', 'audit records only the identity proof type');
select ok((select not (metadata ? 'email') and not (metadata ? 'document') from public.audit_logs where action = 'customer.store_account_linked' and entity_id = 'store-link-existing-a'), 'audit metadata stores no email or document');

select set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  format(
    'select * from public.ensure_store_customer_account(%L,%L,%L,%L,%L,null,null,null::date,''whatsapp'',''2026-06'',''2026-06'',false,false)',
    (select tenant_a from store_link_test_tenants), 'Existing A', 'fisica', '111.222.333-44', '71999990001'
  ),
  'same auth user is idempotent'
);
reset role;
select is((select count(*)::integer from public.store_customer_accounts where customer_id = 'store-link-existing-a'), 1, 'idempotent retry never duplicates the link');
select is((select count(*)::integer from public.audit_logs where action = 'customer.store_account_linked' and entity_id = 'store-link-existing-a'), 1, 'idempotent retry never duplicates the link audit');

select set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  format(
    'select * from public.ensure_store_customer_account(%L,%L,%L,%L,%L,null,null,null::date,''whatsapp'',''2026-06'',''2026-06'',false,false)',
    (select tenant_a from store_link_test_tenants), 'Attacker', 'juridica', '55666777000188', '71999999999'
  ),
  'P0001',
  'Nao foi possivel concluir o cadastro.',
  'customer already linked to another auth user cannot be reassigned'
);
reset role;
select is((select auth_user_id from public.customers where id = 'store-link-owned'), '46000000-0000-0000-0000-000000000003'::uuid, 'another user never overwrites the existing owner');

select set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  format(
    'select * from public.ensure_store_customer_account(%L,%L,%L,%L,%L,null,null,null::date,''whatsapp'',''2026-06'',''2026-06'',false,false)',
    (select tenant_a from store_link_test_tenants), 'Unconfirmed', 'fisica', '99988877766', '71999990003'
  ),
  'P0001',
  'Nao foi possivel concluir o cadastro.',
  'unconfirmed email is not accepted as ownership proof'
);
reset role;
select is((select auth_user_id from public.customers where id = 'store-link-unconfirmed'), null::uuid, 'unconfirmed identity leaves the existing customer untouched');

select set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  format(
    'select * from public.ensure_store_customer_account(%L,%L,%L,%L,%L,null,null,null::date,''whatsapp'',''2026-06'',''2026-06'',false,false)',
    (select tenant_a from store_link_test_tenants), 'New Store User', 'fisica', '33344455566', '71999990005'
  ),
  'authenticated user can create a legitimate new Store customer'
);
reset role;
select is((select count(*)::integer from public.customers where company_id = (select tenant_a from store_link_test_tenants) and auth_user_id = '46000000-0000-0000-0000-000000000004'), 1, 'new onboarding creates one customer owned by auth.uid');
select is((select count(*)::integer from public.store_customer_accounts where company_id = (select tenant_a from store_link_test_tenants) and auth_user_id = '46000000-0000-0000-0000-000000000004'), 1, 'new onboarding creates one Store account');

select set_config('request.headers', '{"origin":"https://store-link-a.example.test"}', true);
select set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  format(
    'select * from public.ensure_store_customer_account(%L,%L,%L,%L,%L,null,null,null::date,''whatsapp'',''2026-06'',''2026-06'',false,false)',
    (select tenant_b from store_link_test_tenants), 'Wrong Tenant', 'fisica', '44455566677', '71999990006'
  ),
  'P0001',
  'Nao foi possivel concluir o cadastro.',
  'browser-provided company_id cannot cross the request host tenant'
);
reset role;
select is((select count(*)::integer from public.store_customer_accounts where company_id = (select tenant_b from store_link_test_tenants) and auth_user_id = '46000000-0000-0000-0000-000000000004'), 0, 'cross-tenant attempt creates no account');

select set_config('request.jwt.claims', '{}', true);
set local role authenticated;
select throws_ok(
  format(
    'select * from public.ensure_store_customer_account(%L,%L,%L,%L,%L,null,null,null::date,''whatsapp'',''2026-06'',''2026-06'',false,false)',
    (select tenant_a from store_link_test_tenants), 'No Session', 'fisica', '55566677788', '71999990007'
  ),
  'P0001',
  'Sessao do cliente nao encontrada.',
  'missing authentication is rejected'
);
reset role;

select ok(
  (select pg_get_functiondef('public.ensure_store_customer_account(text,text,text,text,text,text,text,date,text,text,text,boolean,boolean)'::regprocedure)) ilike '%pg_advisory_xact_lock%',
  'account reconciliation is serialized before ownership writes'
);
select ok(not has_table_privilege('anon', 'public.customers', 'SELECT'), 'anon cannot enumerate customers');

select * from finish();
rollback;
