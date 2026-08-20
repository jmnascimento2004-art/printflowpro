begin;
select plan(48);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('45000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'integrity-a@example.test', '', now(), '{}'::jsonb, '{"name":"Integrity Admin A","company_name":"Integrity A"}'::jsonb, now(), now()),
  ('45000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'integrity-b@example.test', '', now(), '{}'::jsonb, '{"name":"Integrity Admin B","company_name":"Integrity B"}'::jsonb, now(), now());

insert into public.customers (
  id, company_id, name, document, phone, email, address, tags, notes,
  billing_type, credit_limit, credit_used, payment_terms_days, credit_status
) values
  ('integrity-common-a', (select company_id from public.profiles where auth_user_id = '45000000-0000-0000-0000-000000000001'), 'Cliente Comum A', '1', '1', 'common@example.test', '{}'::jsonb, '{}', '', 'imediato', 0, 0, 0, 'aprovado'),
  ('integrity-b2b-a', (select company_id from public.profiles where auth_user_id = '45000000-0000-0000-0000-000000000001'), 'Cliente B2B A', '2', '2', 'b2b-a@example.test', '{}'::jsonb, '{}', '', 'faturado', 10000, 0, 30, 'aprovado'),
  ('integrity-b2b-b', (select company_id from public.profiles where auth_user_id = '45000000-0000-0000-0000-000000000002'), 'Cliente B2B B', '3', '3', 'b2b-b@example.test', '{}'::jsonb, '{}', '', 'faturado', 10000, 0, 30, 'aprovado');

insert into public.orders (
  id, company_id, customer_id, customer_name, number, status,
  total_amount, paid_amount, payment_status, deadline, updated_at
) values
  ('integrity-production-a', (select company_id from public.profiles where auth_user_id = '45000000-0000-0000-0000-000000000001'), 'integrity-common-a', 'Cliente Comum A', 'PED-0901', 'aguardando_pagamento', 100, 0, 'pendente', now() + interval '2 days', '2026-08-20 12:00:00+00'),
  ('integrity-production-b', (select company_id from public.profiles where auth_user_id = '45000000-0000-0000-0000-000000000002'), 'integrity-b2b-b', 'Cliente B2B B', 'PED-0902', 'aguardando_pagamento', 900, 0, 'pendente', now() + interval '2 days', '2026-08-20 12:00:00+00'),
  ('integrity-b2b-main', (select company_id from public.profiles where auth_user_id = '45000000-0000-0000-0000-000000000001'), 'integrity-b2b-a', 'Cliente B2B A', 'PED-0903', 'aguardando_pagamento', 1000, 0, 'pendente', now() + interval '2 days', '2026-08-20 12:00:00+00'),
  ('integrity-common-open', (select company_id from public.profiles where auth_user_id = '45000000-0000-0000-0000-000000000001'), 'integrity-common-a', 'Cliente Comum A', 'PED-0904', 'aguardando_pagamento', 500, 0, 'pendente', now() + interval '2 days', '2026-08-20 12:00:00+00');

insert into public.order_items (id, order_id, product_name, quantity) values
  ('integrity-item-a', 'integrity-production-a', 'Banner A', 1),
  ('integrity-item-b', 'integrity-production-b', 'Banner B', 1),
  ('integrity-item-main', 'integrity-b2b-main', 'Cartao B2B', 10),
  ('integrity-item-common', 'integrity-common-open', 'Produto comum', 1);

select set_config('request.jwt.claims', '{"sub":"45000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::integer from public.ensure_production_queue_for_order('integrity-production-a')), 0, 'an ineligible waiting order does not enter production');
select is(public.transition_order_status_and_production('integrity-production-a', 'producao', '2026-08-20 12:00:00+00')->>'status', 'UPDATED', 'explicit order transition succeeds');
select is(jsonb_array_length(public.transition_order_status_and_production('integrity-production-a', 'producao', (select updated_at from public.orders where id = 'integrity-production-a'))->'production'), 0, 'repeated explicit transition inserts no queue row');
select is((select count(*)::integer from public.production_queue where order_id = 'integrity-production-a'), 1, 'eligible order item enters production exactly once');
select is((select status from public.production_queue where order_id = 'integrity-production-a'), 'fila', 'new queue row starts in the official initial stage');
select is(public.transition_order_status_and_production('integrity-production-a', 'producao', (select updated_at from public.orders where id = 'integrity-production-a'))->>'status', 'UNCHANGED', 'same order transition is an explicit no-op');
select is((select count(*)::integer from public.production_queue where order_id = 'integrity-production-a'), 1, 'no-op preserves queue cardinality');
select is((select result_status from public.transition_production_stage((select id from public.production_queue where order_id = 'integrity-production-a'), 'concluido', (select updated_at from public.production_queue where order_id = 'integrity-production-a'))), 'UPDATED', 'manual production transition succeeds');
select is(
  public.save_order_with_items_and_production(
    (select to_jsonb(o) || jsonb_build_object('deadline', '2026-08-30 12:00:00+00') from public.orders o where o.id = 'integrity-production-a'),
    (select jsonb_agg((to_jsonb(i) - 'order_id') || jsonb_build_object('product_name', 'Banner A revisado', 'quantity', 3)) from public.order_items i where i.order_id = 'integrity-production-a'),
    (select updated_at from public.orders where id = 'integrity-production-a')
  )->>'result_status',
  'UPDATED',
  'saving an eligible order remains an explicit server command'
);
select is((select status from public.production_queue where order_id = 'integrity-production-a'), 'concluido', 'order save never overwrites the manual production stage');
select is((select product_name from public.production_queue where order_id = 'integrity-production-a'), 'Banner A revisado', 'explicit save refreshes the denormalized production product name');
select is((select quantity from public.production_queue where order_id = 'integrity-production-a'), 3::numeric, 'explicit save refreshes the denormalized production quantity');
select is((select deadline from public.production_queue where order_id = 'integrity-production-a'), '2026-08-30 12:00:00+00'::timestamptz, 'explicit save refreshes the denormalized production deadline');
select is((select count(*)::integer from public.production_queue where order_id = 'integrity-production-a'), 1, 'order save cannot duplicate production');
select is(public.transition_order_status_and_production('integrity-production-b', 'producao', '2026-08-20 12:00:00+00')->>'status', 'NOT_FOUND', 'cross-tenant order is not disclosed');

reset role;
select is((select count(*)::integer from public.production_queue where order_id = 'integrity-production-b'), 0, 'cross-tenant command creates no queue row');

select set_config('request.jwt.claims', '{"sub":"45000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(public.record_order_payment_and_production('integrity-b2b-main', 1000, 'faturado', 'total', null, null, '2026-08-20 12:00:00+00')->>'status', 'UPDATED', 'B2B invoice is recorded atomically');
select is((select count(*)::integer from public.production_queue where order_id = 'integrity-b2b-main'), 1, 'B2B invoice moves the eligible order into production');
select is(public.get_b2b_credit_exposure(), 1000::numeric, 'open B2B invoice consumes the full limit');
select is(public.record_order_payment_and_production('integrity-b2b-main', 400, 'pix', 'parcial', null, null, (select updated_at from public.orders where id = 'integrity-b2b-main'))->>'status', 'UPDATED', 'partial payment is recorded');
select is(public.get_b2b_credit_exposure(), 600::numeric, 'partial payment reduces B2B exposure');
select is(public.settle_financial_transaction((select id from public.financial_transactions where order_id = 'integrity-b2b-main' and payment_method = 'pix'), 'pendente', (select updated_at from public.financial_transactions where order_id = 'integrity-b2b-main' and payment_method = 'pix'))->>'status', 'UPDATED', 'payment reversal succeeds');
select is(public.get_b2b_credit_exposure(), 1000::numeric, 'payment reversal restores B2B exposure');
select is(public.settle_financial_transaction((select id from public.financial_transactions where order_id = 'integrity-b2b-main' and payment_method = 'pix'), 'pago', (select updated_at from public.financial_transactions where order_id = 'integrity-b2b-main' and payment_method = 'pix'))->>'status', 'UPDATED', 'reapplying the payment succeeds');
select is(public.get_b2b_credit_exposure(), 600::numeric, 'reapplied payment reduces exposure once');
select is(public.record_order_payment_and_production('integrity-b2b-main', 600, 'pix', 'saldo', null, null, (select updated_at from public.orders where id = 'integrity-b2b-main'))->>'status', 'UPDATED', 'remaining payment is recorded');
select is(public.get_b2b_credit_exposure(), 0::numeric, 'full payment releases B2B exposure');
select is((select count(*)::integer from public.production_queue where order_id = 'integrity-b2b-main'), 1, 'multiple payments never duplicate production');

reset role;
insert into public.orders (id, company_id, customer_id, customer_name, number, status, total_amount, paid_amount, payment_status, deadline, updated_at)
values ('integrity-b2b-cancel', (select company_id from public.profiles where auth_user_id = '45000000-0000-0000-0000-000000000001'), 'integrity-b2b-a', 'Cliente B2B A', 'PED-0905', 'aguardando_pagamento', 250, 0, 'pendente', now() + interval '2 days', '2026-08-20 12:00:00+00');

select set_config('request.jwt.claims', '{"sub":"45000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(public.get_b2b_credit_exposure(), 250::numeric, 'unpaid B2B receivable is included even without a legacy ledger row');
select is(public.transition_order_status_and_production('integrity-b2b-cancel', 'cancelado', '2026-08-20 12:00:00+00')->>'status', 'UPDATED', 'B2B order cancellation succeeds');
select is(public.get_b2b_credit_exposure(), 0::numeric, 'cancelled order consumes no B2B exposure');

reset role;
insert into public.orders (id, company_id, customer_id, customer_name, number, status, total_amount, paid_amount, payment_status, deadline, updated_at)
values ('integrity-b2b-legacy-number', (select company_id from public.profiles where auth_user_id = '45000000-0000-0000-0000-000000000001'), 'integrity-b2b-a', 'Cliente B2B A', 'PED-0100', 'finalizado', 1000, 0, 'parcial', now() + interval '2 days', '2026-08-20 12:00:00+00');
insert into public.financial_transactions (id, company_id, order_id, order_number, type, category, amount, description, payment_method, status, due_date)
values
  ('integrity-paid-linked', (select company_id from public.profiles where auth_user_id = '45000000-0000-0000-0000-000000000001'), 'integrity-b2b-legacy-number', 'ORD-0100', 'receita', 'Vendas', 100, 'Linked payment', 'pix', 'pago', current_date),
  ('integrity-paid-number', (select company_id from public.profiles where auth_user_id = '45000000-0000-0000-0000-000000000001'), null, 'ORD-0100', 'receita', 'Vendas', 300, 'Legacy payment', 'pix', 'pago', current_date);

select set_config('request.jwt.claims', '{"sub":"45000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(public.get_b2b_credit_exposure(), 600::numeric, 'PED and ORD payment links are reconciled without double counting one row');
select is((select count(*)::integer from public.production_queue where order_id = 'integrity-production-b'), 0, 'tenant B production remains isolated');
select is(public.get_b2b_credit_exposure(), 600::numeric, 'common-customer and tenant-B balances do not contaminate tenant A');
select function_privs_are('public', 'get_b2b_credit_exposure', array[]::text[], 'authenticated', array['EXECUTE']);
select function_privs_are('public', 'get_b2b_credit_exposure', array[]::text[], 'anon', array[]::text[]);
select function_privs_are('public', 'save_order_with_items_phase4b', array['jsonb','jsonb','timestamptz'], 'authenticated', array[]::text[], 'legacy order save cannot bypass production integrity');
select function_privs_are('public', 'transition_order_status_phase4b', array['text','text','timestamptz'], 'authenticated', array[]::text[], 'legacy order transition cannot bypass production integrity');
select function_privs_are('public', 'record_order_payment_phase4b', array['text','numeric','text','text','timestamptz','text','timestamptz'], 'authenticated', array[]::text[], 'legacy order payment cannot bypass production integrity');
select function_privs_are('public', 'save_order_with_items_and_production', array['jsonb','jsonb','timestamptz'], 'authenticated', array['EXECUTE'], 'authenticated uses the atomic order save boundary');
select function_privs_are('public', 'transition_order_status_and_production', array['text','text','timestamptz'], 'authenticated', array['EXECUTE'], 'authenticated uses the atomic order transition boundary');
select function_privs_are('public', 'record_order_payment_and_production', array['text','numeric','text','text','timestamptz','text','timestamptz'], 'authenticated', array['EXECUTE'], 'authenticated uses the atomic order payment boundary');
select ok(not has_table_privilege('authenticated', 'public.orders', 'INSERT'), 'authenticated cannot insert orders outside the command boundary');
select ok(not has_table_privilege('authenticated', 'public.orders', 'UPDATE'), 'authenticated cannot update orders outside the command boundary');
select ok(not has_table_privilege('authenticated', 'public.order_items', 'INSERT'), 'authenticated cannot insert order items outside the command boundary');
select ok(not has_table_privilege('authenticated', 'public.order_items', 'UPDATE'), 'authenticated cannot update order items outside the command boundary');
select throws_ok(
  $$select public.save_order_with_items_and_production(
    jsonb_build_object(
      'id', 'integrity-missing-item-id',
      'company_id', private.current_company_id(),
      'customer_name', 'Cliente sem item id',
      'status', 'producao',
      'total_amount', 10,
      'paid_amount', 0,
      'payment_status', 'pendente'
    ),
    jsonb_build_array(jsonb_build_object('product_name', 'Item sem id', 'quantity', 1)),
    null
  )$$,
  '22023',
  'ORDER_ITEM_ID_REQUIRED',
  'order items without a stable id are rejected atomically'
);
select has_index(
  'public',
  'financial_transactions',
  'financial_transactions_company_legacy_order_paid_idx',
  'legacy PED and ORD payment lookup has a matching partial functional index'
);

select * from finish();
rollback;
