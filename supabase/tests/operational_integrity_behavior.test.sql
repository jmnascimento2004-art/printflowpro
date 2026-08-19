begin;
select plan(44);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('41000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'phase4a-a@example.test', '', now(), '{}'::jsonb, '{"name":"Admin A","company_name":"Phase 4A A"}'::jsonb, now(), now()),
  ('41000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'phase4a-b@example.test', '', now(), '{}'::jsonb, '{"name":"Admin B","company_name":"Phase 4A B"}'::jsonb, now(), now()),
  ('41000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'phase4a-c@example.test', '', now(), '{}'::jsonb, '{"name":"Operator C","company_name":"Phase 4A C"}'::jsonb, now(), now());

update public.profiles
set
  company_id = (select company_id from public.profiles where auth_user_id = '41000000-0000-0000-0000-000000000001'),
  role = 'vendas'
where auth_user_id = '41000000-0000-0000-0000-000000000003';

insert into public.orders (id, company_id, customer_name, number, status, deadline)
values
  ('phase4a-order-a', (select company_id from public.profiles where auth_user_id = '41000000-0000-0000-0000-000000000001'), 'Cliente A', 'ORD-A', 'producao', now() + interval '2 days'),
  ('phase4a-order-a2', (select company_id from public.profiles where auth_user_id = '41000000-0000-0000-0000-000000000001'), 'Cliente A2', 'ORD-A2', 'producao', now() + interval '2 days'),
  ('phase4a-order-b', (select company_id from public.profiles where auth_user_id = '41000000-0000-0000-0000-000000000002'), 'Cliente B', 'ORD-B', 'producao', now() + interval '2 days');

insert into public.order_items (id, order_id, product_name, quantity)
values
  ('phase4a-item-a', 'phase4a-order-a', 'Banner A', 1),
  ('phase4a-item-a2', 'phase4a-order-a2', 'Banner A2', 2),
  ('phase4a-item-b', 'phase4a-order-b', 'Banner B', 1);

insert into public.production_queue (
  id, company_id, order_id, order_number, order_item_id, product_name,
  quantity, status, priority, deadline, created_at, updated_at
) values
  ('phase4a-queue-a', (select company_id from public.profiles where auth_user_id = '41000000-0000-0000-0000-000000000001'), 'phase4a-order-a', 'ORD-A', 'phase4a-item-a', 'Banner A', 1, 'fila', 'media', now() + interval '2 days', '2026-08-19 09:00:00+00', '2026-08-19 09:00:00+00'),
  ('phase4a-queue-b', (select company_id from public.profiles where auth_user_id = '41000000-0000-0000-0000-000000000002'), 'phase4a-order-b', 'ORD-B', 'phase4a-item-b', 'Banner B', 1, 'fila', 'media', now() + interval '2 days', '2026-08-19 09:00:00+00', '2026-08-19 09:00:00+00');

select ok(exists (select 1 from public.profiles where auth_user_id = '41000000-0000-0000-0000-000000000001' and role = 'admin'), 'admin A fixture is provisioned');
select ok(exists (select 1 from public.profiles where auth_user_id = '41000000-0000-0000-0000-000000000002' and role = 'admin'), 'admin B fixture is provisioned');
select ok(exists (select 1 from public.profiles where auth_user_id = '41000000-0000-0000-0000-000000000003' and role = 'vendas'), 'non-production operator fixture exists in tenant A');

select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select result_status from public.transition_production_stage('phase4a-queue-a', 'producao', '2026-08-19 09:00:00+00')),
  'UPDATED',
  'authorized current version changes the stage'
);
select is((select status from public.production_queue where id = 'phase4a-queue-a'), 'producao', 'accepted stage is persisted');
select ok((select started_at is not null from public.production_queue where id = 'phase4a-queue-a'), 'first active stage records started_at');
select is((select count(*)::integer from public.audit_logs), 1, 'accepted transition appends one audit row');
select is((select actor_user_id from public.audit_logs limit 1), '41000000-0000-0000-0000-000000000001'::uuid, 'audit stores the authenticated actor id');
select is((select actor_name from public.audit_logs limit 1), 'Admin A', 'audit stores the actor name snapshot');
select is((select actor_role from public.audit_logs limit 1), 'admin', 'audit stores the actor role snapshot');
select is((select action from public.audit_logs limit 1), 'production.stage_changed', 'audit action is structured');
select is((select entity_type from public.audit_logs limit 1), 'production_queue', 'audit entity type is structured');
select is((select module from public.audit_logs limit 1), 'production', 'audit module is structured');
select is((select old_values ->> 'status' from public.audit_logs limit 1), 'fila', 'audit stores the previous stage');
select is((select new_values ->> 'status' from public.audit_logs limit 1), 'producao', 'audit stores the accepted stage');
select is((select metadata ->> 'order_id' from public.audit_logs limit 1), 'phase4a-order-a', 'audit metadata links the order safely');

select is(
  (select result_status from public.transition_production_stage('phase4a-queue-a', 'impressao', '2026-08-19 09:00:00+00')),
  'CONFLICT',
  'stale expected version is rejected'
);
select is((select count(*)::integer from public.audit_logs), 1, 'rejected stale transition creates no audit row');
select is(
  (select result_status from public.transition_production_stage('phase4a-queue-a', 'producao', (select updated_at from public.production_queue where id = 'phase4a-queue-a'))),
  'UNCHANGED',
  'same persisted stage is an explicit no-op'
);
select is((select count(*)::integer from public.audit_logs), 1, 'no-op creates no audit row');
select is(
  (select result_status from public.transition_production_stage('phase4a-queue-a', 'arbitrary', (select updated_at from public.production_queue where id = 'phase4a-queue-a'))),
  'INVALID_STATUS',
  'arbitrary stage is rejected'
);
select is((select status from public.production_queue where id = 'phase4a-queue-a'), 'producao', 'invalid stage leaves persisted state unchanged');
select is(
  (select result_status from public.transition_production_stage('phase4a-queue-b', 'producao', '2026-08-19 09:00:00+00')),
  'NOT_FOUND',
  'cross-tenant queue id is not disclosed'
);

reset role;
select is((select status from public.production_queue where id = 'phase4a-queue-b'), 'fila', 'cross-tenant attempt leaves target unchanged');

select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select result_status from public.transition_production_stage('phase4a-queue-a', 'impressao', (select updated_at from public.production_queue where id = 'phase4a-queue-a'))),
  'NOT_AUTHORIZED',
  'user without production permission cannot transition a stage'
);

reset role;
select set_config('request.jwt.claims', '{}', true);
set local role authenticated;
select is(
  (select result_status from public.transition_production_stage('phase4a-queue-a', 'impressao', '2026-08-19 09:00:00+00')),
  'NOT_AUTHORIZED',
  'missing auth uid is rejected'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.ensure_production_queue_for_order('phase4a-order-a2')), 1, 'initial queue creation inserts the missing item once');
select is((select status from public.production_queue where order_item_id = 'phase4a-item-a2'), 'fila', 'initial stage derives from the order only at creation');
select is((select count(*)::integer from public.ensure_production_queue_for_order('phase4a-order-a2')), 0, 'repeated queue creation is idempotent');

reset role;
update public.orders set status = 'impressao' where id = 'phase4a-order-a2';
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.ensure_production_queue_for_order('phase4a-order-a2')), 0, 'order changes do not recreate an existing queue row');
select is((select status from public.production_queue where order_item_id = 'phase4a-item-a2'), 'fila', 'later order changes do not overwrite the persisted production stage');

select throws_ok(
  $$update public.production_queue set status = 'concluido' where id = 'phase4a-queue-a'$$,
  '42501',
  'permission denied for table production_queue',
  'browser role cannot bypass the audited stage RPC'
);
select lives_ok(
  $$update public.production_queue set responsible_name = 'Ana' where id = 'phase4a-queue-a'$$,
  'responsible assignment remains an allowed independent column update'
);
select is((select responsible_name from public.production_queue where id = 'phase4a-queue-a'), 'Ana', 'responsible assignment is persisted without changing stage');

reset role;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select result_status from public.transition_production_stage('phase4a-queue-b', 'producao', '2026-08-19 09:00:00+00')),
  'UPDATED',
  'tenant B can update its own queue'
);
select is((select count(*)::integer from public.audit_logs), 1, 'tenant B sees its own audit event');
select is((select count(*)::integer from public.audit_logs where entity_id = 'phase4a-queue-a'), 0, 'tenant B cannot read tenant A audit events');

reset role;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.audit_logs), 1, 'tenant A admin sees only tenant A audit events');
select is((select count(*)::integer from public.audit_logs where entity_id = 'phase4a-queue-b'), 0, 'tenant A cannot read tenant B audit events');

reset role;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.audit_logs), 0, 'non-admin operator cannot read tenant audit events');

select throws_ok(
  $$insert into public.audit_logs (company_id, actor_user_id, actor_name, actor_role, action, entity_type, entity_id, module) values ('x', '41000000-0000-0000-0000-000000000003', 'x', 'x', 'x', 'x', 'x', 'x')$$,
  '42501',
  'permission denied for table audit_logs',
  'application users cannot insert arbitrary audit rows'
);
select throws_ok(
  $$update public.audit_logs set action = 'tampered'$$,
  '42501',
  'permission denied for table audit_logs',
  'application users cannot mutate audit rows'
);
select throws_ok(
  $$delete from public.audit_logs$$,
  '42501',
  'permission denied for table audit_logs',
  'application users cannot delete audit rows'
);

reset role;
select ok(not exists (
  select 1
  from public.audit_logs
  where metadata ?| array['password', 'token', 'secret', 'service_role']
), 'audit metadata contains no credential-shaped fields');

select * from finish();
rollback;
