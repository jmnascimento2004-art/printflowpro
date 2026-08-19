begin;
select plan(38);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('42000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'phase4b-a@example.test', '', now(), '{}'::jsonb, '{"name":"Admin A","company_name":"Phase 4B A"}'::jsonb, now(), now()),
  ('42000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'phase4b-b@example.test', '', now(), '{}'::jsonb, '{"name":"Admin B","company_name":"Phase 4B B"}'::jsonb, now(), now()),
  ('42000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'phase4b-sales@example.test', '', now(), '{}'::jsonb, '{"name":"Sales A","company_name":"Phase 4B Sales"}'::jsonb, now(), now());

update public.profiles set
  company_id = (select company_id from public.profiles where auth_user_id = '42000000-0000-0000-0000-000000000001'),
  role = 'vendas'
where auth_user_id = '42000000-0000-0000-0000-000000000003';

insert into public.products(id, company_id, name, pricing_type, base_cost, sales_price, stock_controlled, current_stock, updated_at)
values
  ('phase4b-product-a', (select company_id from public.profiles where auth_user_id = '42000000-0000-0000-0000-000000000001'), 'Produto A', 'unidade', 2, 5, true, 10, '2026-08-19 10:00:00+00'),
  ('phase4b-product-b', (select company_id from public.profiles where auth_user_id = '42000000-0000-0000-0000-000000000002'), 'Produto B', 'unidade', 2, 5, true, 20, '2026-08-19 10:00:00+00');

insert into public.customers(id, company_id, name, document, phone, email, address, tags, notes, billing_type, credit_used)
values ('phase4b-customer-a', (select company_id from public.profiles where auth_user_id = '42000000-0000-0000-0000-000000000001'), 'Cliente A', '1', '1', 'a@example.test', '{}'::jsonb, '{}', '', 'faturado', 20);

insert into public.orders(id, company_id, customer_id, customer_name, number, status, total_amount, paid_amount, payment_status, deadline, updated_at)
values ('phase4b-order-a', (select company_id from public.profiles where auth_user_id = '42000000-0000-0000-0000-000000000001'), 'phase4b-customer-a', 'Cliente A', 'ORD-A', 'aguardando_pagamento', 100, 0, 'pendente', now() + interval '2 days', '2026-08-19 10:00:00+00');

insert into public.financial_transactions(id, company_id, order_id, order_number, type, category, amount, description, payment_method, status, due_date, updated_at)
values ('phase4b-fin-a', (select company_id from public.profiles where auth_user_id = '42000000-0000-0000-0000-000000000001'), 'phase4b-order-a', 'ORD-A', 'receita', 'Vendas', 20, 'Parcela', 'faturado', 'pendente', current_date, '2026-08-19 10:00:00+00');

select ok(exists (select 1 from public.profiles where auth_user_id = '42000000-0000-0000-0000-000000000001' and role = 'admin'), 'tenant A admin exists');
select ok(exists (select 1 from public.profiles where auth_user_id = '42000000-0000-0000-0000-000000000002' and role = 'admin'), 'tenant B admin exists');
select ok(exists (select 1 from public.profiles where auth_user_id = '42000000-0000-0000-0000-000000000003' and role = 'vendas'), 'tenant A sales user exists');

select set_config('request.jwt.claims', '{"sub":"42000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(public.adjust_inventory_stock('phase4b-product-a', 3, 'saida', 'Pedido', null, '2026-08-19 10:00:00+00')->>'status', 'UPDATED', 'authorized stock command succeeds');
select is((select current_stock from public.products where id = 'phase4b-product-a'), 7::numeric, 'stock delta is persisted');
select is((select count(*)::integer from public.stock_movements where product_id = 'phase4b-product-a'), 1, 'one movement is appended');
select is((select count(*)::integer from public.audit_logs where action = 'inventory.adjusted'), 1, 'inventory command appends one canonical audit event');
select is(public.adjust_inventory_stock('phase4b-product-a', 1, 'saida', 'Stale', null, '2026-08-19 10:00:00+00')->>'status', 'CONFLICT', 'stale stock command is rejected');
select is((select current_stock from public.products where id = 'phase4b-product-a'), 7::numeric, 'stale command cannot overwrite current stock');
select is((select count(*)::integer from public.stock_movements where product_id = 'phase4b-product-a'), 1, 'stale command appends no movement');
select is(public.adjust_inventory_stock('phase4b-product-b', 1, 'saida', 'Cross tenant', null, '2026-08-19 10:00:00+00')->>'status', 'NOT_FOUND', 'cross-tenant product id is not disclosed');

reset role;
select is((select current_stock from public.products where id = 'phase4b-product-b'), 20::numeric, 'cross-tenant stock remains unchanged');
select set_config('request.jwt.claims', '{"sub":"42000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is(public.adjust_inventory_stock('phase4b-product-a', 1, 'saida', 'Unauthorized', null, null)->>'status', 'NOT_AUTHORIZED', 'role without stock permission is rejected');

reset role;
select set_config('request.jwt.claims', '{"sub":"42000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(public.operate_cash_register('open', 100, 'Phase 4B', null)->>'status', 'UPDATED', 'cash is opened atomically');
select is((select count(*)::integer from public.cash_register_sessions where status = 'aberto'), 1, 'one open cash session exists');
select is(public.operate_cash_register('open', 50, 'Duplicate', null)->>'status', 'CONFLICT', 'second open cash session is rejected');
select is(public.operate_cash_register('sangria', 25, 'Teste', (select updated_at from public.cash_register_sessions where status = 'aberto'))->>'status', 'UPDATED', 'cash withdrawal uses current version');
select is((select expected_cash from public.cash_register_sessions where status = 'aberto'), 75::numeric, 'cash delta is persisted');
select is((select count(*)::integer from public.cash_register_transactions where type = 'sangria'), 1, 'cash command appends one register movement');
select ok(exists (select 1 from public.audit_logs where action = 'cash_register.balance_changed'), 'cash balance change is audited');

select is(public.transition_order_status_phase4b('phase4b-order-a', 'expedicao', '2026-08-19 10:00:00+00')->>'status', 'UPDATED', 'order transition is explicit and atomic');
select is((select count(*)::integer from public.shipments where order_id = 'phase4b-order-a'), 1, 'expedition transition creates one shipment');
select is(public.transition_order_status_phase4b('phase4b-order-a', 'finalizado', '2026-08-19 10:00:00+00')->>'status', 'CONFLICT', 'stale order transition is rejected');
select is((select count(*)::integer from public.shipments where order_id = 'phase4b-order-a'), 1, 'stale transition cannot duplicate a shipment');

select is(public.settle_financial_transaction('phase4b-fin-a', 'pago', '2026-08-19 10:00:00+00')->>'status', 'UPDATED', 'financial settlement is atomic');
select is((select status from public.financial_transactions where id = 'phase4b-fin-a'), 'pago', 'settlement persists the financial status');
select is((select paid_amount from public.orders where id = 'phase4b-order-a'), 20::numeric, 'settlement updates the linked order once');
select is((select credit_used from public.customers where id = 'phase4b-customer-a'), 0::numeric, 'settlement releases billed customer credit');
select ok(exists (select 1 from public.audit_logs where entity_id = 'phase4b-fin-a' and action = 'financial.payment_changed'), 'financial settlement is audited');
select is(public.settle_financial_transaction('phase4b-fin-a', 'pendente', (select updated_at from public.financial_transactions where id = 'phase4b-fin-a'))->>'status', 'UPDATED', 'financial settlement reversal is atomic');
select is((select paid_amount from public.orders where id = 'phase4b-order-a'), 0::numeric, 'reversal restores the linked order balance');
select is((select credit_used from public.customers where id = 'phase4b-customer-a'), 20::numeric, 'reversal restores billed customer credit');
select is(public.settle_financial_transaction('phase4b-fin-a', 'pago', (select updated_at from public.financial_transactions where id = 'phase4b-fin-a'))->>'status', 'UPDATED', 'reapplying settlement remains consistent');
select is((select paid_amount from public.orders where id = 'phase4b-order-a'), 20::numeric, 'reapplied settlement updates the order exactly once');

select is(public.record_order_payment_phase4b('phase4b-order-a', 30, 'pix', 'parcial', null, null, (select updated_at from public.orders where id = 'phase4b-order-a'))->>'status', 'UPDATED', 'order payment persists through one server command');
select is((select count(*)::integer from public.financial_transactions where order_id = 'phase4b-order-a'), 2, 'payment appends exactly one financial row');
select is((select paid_amount from public.orders where id = 'phase4b-order-a'), 50::numeric, 'payment updates the authoritative order balance');
select ok(not exists (select 1 from public.audit_logs where metadata ?| array['password','token','secret','service_role']), 'audit metadata contains no credential-shaped fields');

select * from finish();
rollback;
