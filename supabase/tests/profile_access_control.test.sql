begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

set local session_replication_role = replica;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin-a@test.local', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'manager-a@test.local', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'worker-a@test.local', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'admin-b@test.local', '', now(), '{}', '{}', now(), now());
set local session_replication_role = origin;

insert into public.companies (id, name, document) values
  ('test-company-a', 'Test A', '00000000000100'),
  ('test-company-b', 'Test B', '00000000000200');
insert into public.profiles (id, company_id, auth_user_id, name, email, role, active) values
  ('test-admin-a', 'test-company-a', '10000000-0000-0000-0000-000000000001', 'Admin A', 'admin-a@test.local', 'admin', true),
  ('test-manager-a', 'test-company-a', '10000000-0000-0000-0000-000000000002', 'Manager A', 'manager-a@test.local', 'gerente', true),
  ('test-worker-a', 'test-company-a', '10000000-0000-0000-0000-000000000003', 'Worker A', 'worker-a@test.local', 'vendas', true),
  ('test-admin-b', 'test-company-b', '10000000-0000-0000-0000-000000000004', 'Admin B', 'admin-b@test.local', 'admin', true);
insert into public.role_permissions (id, company_id, path, roles) values
  ('test-permission-a', 'test-company-a', '/test-a', array['admin']),
  ('test-permission-b', 'test-company-b', '/test-b', array['admin']);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select is((select auth.uid()), '10000000-0000-0000-0000-000000000002'::uuid, 'manager auth.uid is configured');
select is((select private.current_user_role()), 'gerente', 'manager role is configured');
select is((select private.current_company_id()), 'test-company-a', 'manager company is configured');
select throws_ok(
  $$select public.set_profile_access('test-manager-a', 'admin', true)$$,
  '42501', 'admin_required', 'manager cannot become admin'
);
select throws_ok(
  $$insert into public.role_permissions (id, company_id, path, roles) values ('manager-insert', 'test-company-a', '/manager-insert', array['gerente'])$$,
  '42501', 'new row violates row-level security policy for table "role_permissions"',
  'manager cannot create permission matrix'
);
select is((select count(*) from public.role_permissions where id = 'manager-insert'), 0::bigint, 'blocked manager insert changes no data');
select is_empty(
  $$update public.role_permissions set roles = array['gerente'] where id = 'test-permission-a' returning id$$,
  'manager cannot update role-permission association'
);
select is((select roles from public.role_permissions where id = 'test-permission-a'), array['admin']::text[], 'blocked manager update leaves roles unchanged');
select is_empty(
  $$delete from public.role_permissions where id = 'test-permission-a' returning id$$,
  'manager cannot delete permission matrix'
);
select is((select count(*) from public.role_permissions where id = 'test-permission-a'), 1::bigint, 'blocked manager delete leaves row intact');
select is_empty(
  $$update public.role_permissions set roles = array['gerente'] where id = 'test-permission-b' returning id$$,
  'manager cannot modify another company matrix'
);
select lives_ok($$select public.provision_current_auth_user()$$, 'manager may call profile provisioning RPC safely');
select is((select roles from public.role_permissions where id = 'test-permission-a'), array['admin']::text[], 'provisioning RPC cannot alter manager permission matrix');
select results_eq(
  $$select id from public.role_permissions where company_id = 'test-company-a' order by id$$,
  $$values ('test-permission-a'::text)$$,
  'manager retains authorized matrix read access'
);
select lives_ok(
  $$update public.profiles set name = 'Manager Updated' where id = 'test-manager-a'$$,
  'common profile fields remain updatable'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is((select private.current_user_role()), 'admin', 'administrator role is configured');
select lives_ok(
  $$update public.role_permissions set roles = array['admin','gerente'] where id = 'test-permission-a'$$,
  'administrator updates own company matrix'
);
select is((select roles from public.role_permissions where id = 'test-permission-a'), array['admin','gerente']::text[], 'administrator update persists');
select is_empty(
  $$update public.role_permissions set roles = array['admin','gerente'] where id = 'test-permission-b' returning id$$,
  'administrator cannot update another company matrix'
);
select lives_ok(
  $$select public.set_profile_access('test-worker-a', 'financeiro', true)$$,
  'admin changes access inside own company'
);
select throws_ok(
  $$select public.set_profile_access('test-admin-b', 'gerente', true)$$,
  'P0002', 'profile_not_found', 'admin cannot change another company profile'
);
select throws_ok(
  $$select public.set_profile_access('test-admin-a', 'gerente', true)$$,
  'P0001', 'last_company_admin', 'last administrator cannot be demoted'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$insert into public.role_permissions (id, company_id, path, roles) values ('anon-insert', 'test-company-a', '/anon', array['admin'])$$,
  '42501', 'permission denied for table role_permissions', 'anon cannot modify permission matrices'
);
select is(
  (select count(*) from information_schema.routine_privileges where routine_schema = 'public' and routine_name = 'set_profile_access' and grantee = 'PUBLIC'),
  0::bigint,
  'PUBLIC cannot execute administrative profile RPC'
);

select * from finish();
rollback;
