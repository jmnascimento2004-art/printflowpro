begin;
select plan(32);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('44000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'phase4e-a@example.test', '', now(), '{}'::jsonb, '{"name":"Admin A","company_name":"Phase 4E A"}'::jsonb, now(), now()),
  ('44000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'phase4e-b@example.test', '', now(), '{}'::jsonb, '{"name":"Admin B","company_name":"Phase 4E B"}'::jsonb, now(), now()),
  ('44000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'phase4e-user@example.test', '', now(), '{}'::jsonb, '{"name":"User A","company_name":"Phase 4E User"}'::jsonb, now(), now());

update public.profiles set
  company_id = (select company_id from public.profiles where auth_user_id = '44000000-0000-0000-0000-000000000001'),
  role = 'vendas'
where auth_user_id = '44000000-0000-0000-0000-000000000003';

insert into public.products(id, company_id, name, pricing_type, base_cost, sales_price, active, updated_at)
values
  ('phase4e-product-a', (select company_id from public.profiles where auth_user_id = '44000000-0000-0000-0000-000000000001'), 'Produto A', 'unidade', 5, 10, true, '2026-08-19 12:00:00+00'),
  ('phase4e-product-b', (select company_id from public.profiles where auth_user_id = '44000000-0000-0000-0000-000000000002'), 'Produto B', 'unidade', 5, 10, true, '2026-08-19 12:00:00+00');

select set_config('request.jwt.claims', '{"sub":"44000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

insert into public.suppliers(id, company_id, name) values
  ('phase4e-supplier-a', private.current_company_id(), 'Fornecedor A');
select is((select count(*)::integer from public.audit_logs where entity_id = 'phase4e-supplier-a' and action = 'supplier.created'), 1, 'supplier create appends exactly one event');

update public.products set sales_price = 12 where id = 'phase4e-product-a';
select is((select count(*)::integer from public.audit_logs where entity_id = 'phase4e-product-a' and action = 'product.price_changed'), 1, 'price change has a dedicated event');
select is((select (old_values ->> 'sales_price')::numeric from public.audit_logs where entity_id = 'phase4e-product-a'), 10::numeric, 'price event preserves the prior value');
select is((select (new_values ->> 'sales_price')::numeric from public.audit_logs where entity_id = 'phase4e-product-a'), 12::numeric, 'price event preserves the new value');

update public.profiles set role = 'gerente' where auth_user_id = '44000000-0000-0000-0000-000000000003';
select is((select count(*)::integer from public.audit_logs where action = 'user.role_changed' and entity_id = (select id from public.profiles where auth_user_id = '44000000-0000-0000-0000-000000000003')), 1, 'role change is attributable');
select ok(not exists (select 1 from public.audit_logs where old_values ?| array['email','phone','auth_user_id'] or new_values ?| array['email','phone','auth_user_id']), 'user audit contains no contact or auth identifier');

update public.settings set pix_key = 'sensitive-pix-value', pix_key_type = 'email', catalog_whatsapp = 'sensitive-phone-value' where company_id = private.current_company_id();
select is((select count(*)::integer from public.audit_logs where action = 'settings.pix_updated'), 1, 'PIX change has a dedicated event');
select ok(not exists (select 1 from public.audit_logs where action = 'settings.pix_updated' and (old_values ? 'pix_key' or new_values ? 'pix_key')), 'PIX value is absent from snapshots');
select ok(exists (select 1 from public.audit_logs where action = 'settings.pix_updated' and new_values ? 'pix_key_configured'), 'PIX audit records only configured state');
select ok(not exists (select 1 from public.audit_logs where action = 'settings.pix_updated' and (old_values::text ~* 'sensitive-phone-value' or new_values::text ~* 'sensitive-phone-value' or old_values ? 'catalog_whatsapp' or new_values ? 'catalog_whatsapp')), 'catalog contact value is absent from settings snapshots');

update public.companies set privacy_email = 'sensitive-privacy@example.test' where id = private.current_company_id();
select is((select count(*)::integer from public.audit_logs where action = 'company.configuration_changed'), 1, 'sensitive company configuration change remains auditable');
select ok(not exists (select 1 from public.audit_logs where action = 'company.configuration_changed' and (old_values::text ~* 'sensitive-privacy@example.test' or new_values::text ~* 'sensitive-privacy@example.test' or old_values ? 'privacy_email' or new_values ? 'privacy_email')), 'company privacy contact is absent from snapshots');
select is((select new_values ->> 'sensitive_configuration_changed' from public.audit_logs where action = 'company.configuration_changed'), 'true', 'sensitive company change is recorded without its value');

insert into public.whatsapp_settings(company_id, business_phone, signature)
values (private.current_company_id(), '5571999999999', 'Equipe A');
select is((select count(*)::integer from public.audit_logs where action = 'whatsapp.configuration_changed'), 1, 'WhatsApp configuration is audited');
select ok(not exists (select 1 from public.audit_logs where action = 'whatsapp.configuration_changed' and (new_values ?| array['business_phone','signature'])), 'WhatsApp secrets/contact content are absent');

update public.products set sales_price = 99 where id = 'phase4e-product-b';
select is((select sales_price from public.products where id = 'phase4e-product-b'), 10::numeric, 'cross-tenant product mutation changes no row');
select is((select count(*)::integer from public.audit_logs where entity_id = 'phase4e-product-b'), 0, 'cross-tenant attempt creates no audit event');

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.suppliers(id, company_id, name) values (
  'phase4e-system-supplier',
  (select company_id from public.profiles where auth_user_id = '44000000-0000-0000-0000-000000000002'),
  'Fornecedor SYSTEM'
);
reset role;
select is((select actor_name from public.audit_logs where entity_id = 'phase4e-system-supplier'), 'SYSTEM', 'service role mutation is identified as SYSTEM');
select is((select actor_user_id from public.audit_logs where entity_id = 'phase4e-system-supplier'), null::uuid, 'SYSTEM event invents no human actor id');

select set_config('request.jwt.claims', '{"sub":"44000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.audit_logs where entity_id = 'phase4e-system-supplier'), 0, 'tenant A cannot read tenant B SYSTEM event');
select throws_ok($$insert into public.audit_logs(company_id, actor_user_id, actor_name, actor_role, action, entity_type, entity_id, module) values (private.current_company_id(), '44000000-0000-0000-0000-000000000001', 'A', 'admin', 'forged', 'x', 'x', 'x')$$, '42501', 'permission denied for table audit_logs', 'application cannot forge an event');
select throws_ok($$update public.audit_logs set action = 'tampered'$$, '42501', 'permission denied for table audit_logs', 'application cannot edit history');
select throws_ok($$delete from public.audit_logs$$, '42501', 'permission denied for table audit_logs', 'application cannot delete history');

reset role;
select set_config('request.jwt.claims', '{"sub":"44000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $sql$do $block$ begin update public.suppliers set name = 'Rollback' where id = 'phase4e-supplier-a'; raise exception 'PHASE4E_ROLLBACK'; end $block$;$sql$,
  'P0001', 'PHASE4E_ROLLBACK', 'failed transaction reports the expected error'
);
select is((select name from public.suppliers where id = 'phase4e-supplier-a'), 'Fornecedor A', 'failed transaction rolls back business data');
select is((select count(*)::integer from public.audit_logs where entity_id = 'phase4e-supplier-a' and new_values ->> 'name' = 'Rollback'), 0, 'failed transaction rolls back the audit event');

select is((select count(*)::integer from public.audit_logs where entity_id = 'phase4e-product-a' and action = 'product.price_changed'), 1, 'one logical price update creates one event');
select ok(not exists (select 1 from public.audit_logs where old_values::text ~* 'sensitive-pix-value' or new_values::text ~* 'sensitive-pix-value'), 'sensitive PIX value never reaches audit JSON');
select ok(not exists (select 1 from public.audit_logs where metadata ?| array['password','token','secret','service_role']), 'metadata contains no credential-shaped key');

select lives_ok($$update public.profiles set active = false where auth_user_id = '44000000-0000-0000-0000-000000000001'$$, 'self-deactivation remains a valid audited mutation');
reset role;
select is((select active from public.profiles where auth_user_id = '44000000-0000-0000-0000-000000000001'), false, 'self-deactivation is persisted');
select is((select actor_user_id from public.audit_logs where action = 'user.status_changed' and entity_id = (select id from public.profiles where auth_user_id = '44000000-0000-0000-0000-000000000001')), '44000000-0000-0000-0000-000000000001'::uuid, 'self-deactivation preserves the pre-mutation actor identity');

select * from finish();
rollback;
