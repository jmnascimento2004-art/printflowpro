begin;
select plan(36);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('46000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'quote-approval-a@example.test', '', now(), '{}'::jsonb, '{"name":"Approval Admin A","company_name":"Approval A"}'::jsonb, now(), now()),
  ('46000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'quote-approval-b@example.test', '', now(), '{}'::jsonb, '{"name":"Approval Admin B","company_name":"Approval B"}'::jsonb, now(), now()),
  ('46000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'quote-approval-production@example.test', '', now(), '{}'::jsonb, '{"name":"Approval Production","company_name":"Approval Production"}'::jsonb, now(), now());

update public.profiles
set company_id = (select company_id from public.profiles where auth_user_id = '46000000-0000-0000-0000-000000000001'),
    role = 'producao'
where auth_user_id = '46000000-0000-0000-0000-000000000003';

insert into public.customers (
  id, company_id, name, document, phone, email, address, tags, notes,
  billing_type, credit_limit, credit_used, payment_terms_days, credit_status
) values
  ('quote-approval-customer-a', (select company_id from public.profiles where auth_user_id = '46000000-0000-0000-0000-000000000001'), 'Cliente Approval A', '1', '1', 'approval-a@example.test', '{}'::jsonb, '{}', '', 'imediato', 0, 0, 0, 'aprovado'),
  ('quote-approval-customer-b', (select company_id from public.profiles where auth_user_id = '46000000-0000-0000-0000-000000000002'), 'Cliente Approval B', '2', '2', 'approval-b@example.test', '{}'::jsonb, '{}', '', 'imediato', 0, 0, 0, 'aprovado');

insert into public.quotes (
  id, company_id, customer_id, customer_name, number, status, total_amount,
  discount, notes, delivery_type, delivery_origin_address, delivery_address,
  delivery_distance_km, delivery_fee, additional_services, updated_at
) values
  (
    'quote-approval-a',
    (select company_id from public.profiles where auth_user_id = '46000000-0000-0000-0000-000000000001'),
    'quote-approval-customer-a', 'Cliente Approval A', 9101, 'pendente', 105.50,
    14.50, 'Observacao comercial', 'motoboy', 'Origem A', 'Destino A',
    3.5, 10, '[{"id":"service-a","name":"Arte","quantity":1,"unit_price":20,"total_price":20,"is_custom":true}]'::jsonb,
    '2026-08-26 10:00:00+00'
  ),
  (
    'quote-approval-b',
    (select company_id from public.profiles where auth_user_id = '46000000-0000-0000-0000-000000000002'),
    'quote-approval-customer-b', 'Cliente Approval B', 9102, 'pendente', 50,
    0, null, 'retirada', 'Origem B', null, 0, 0, '[]'::jsonb,
    '2026-08-26 10:00:00+00'
  ),
  (
    'quote-approval-no-customer',
    (select company_id from public.profiles where auth_user_id = '46000000-0000-0000-0000-000000000001'),
    null, 'Sem cliente', 9103, 'pendente', 30,
    0, null, 'retirada', 'Origem A', null, 0, 0, '[]'::jsonb,
    '2026-08-26 10:00:00+00'
  ),
  (
    'quote-approval-no-items',
    (select company_id from public.profiles where auth_user_id = '46000000-0000-0000-0000-000000000001'),
    'quote-approval-customer-a', 'Cliente Approval A', 9104, 'pendente', 30,
    0, null, 'retirada', 'Origem A', null, 0, 0, '[]'::jsonb,
    '2026-08-26 10:00:00+00'
  ),
  (
    'quote-approval-rejected',
    (select company_id from public.profiles where auth_user_id = '46000000-0000-0000-0000-000000000001'),
    'quote-approval-customer-a', 'Cliente Approval A', 9105, 'reprovado', 30,
    0, null, 'retirada', 'Origem A', null, 0, 0, '[]'::jsonb,
    '2026-08-26 10:00:00+00'
  ),
  (
    'quote-approval-rollback',
    (select company_id from public.profiles where auth_user_id = '46000000-0000-0000-0000-000000000001'),
    'quote-approval-customer-a', 'Cliente Approval A', 9106, 'pendente', 30,
    0, null, 'retirada', 'Origem A', null, 0, 0, '[]'::jsonb,
    '2026-08-26 10:00:00+00'
  ),
  (
    'quote-approval-null-status',
    (select company_id from public.profiles where auth_user_id = '46000000-0000-0000-0000-000000000001'),
    'quote-approval-customer-a', 'Cliente Approval A', 9107, null, 30,
    0, null, 'retirada', 'Origem A', null, 0, 0, '[]'::jsonb,
    '2026-08-26 10:00:00+00'
  ),
  (
    'quote-approval-linked-rejected',
    (select company_id from public.profiles where auth_user_id = '46000000-0000-0000-0000-000000000001'),
    'quote-approval-customer-a', 'Cliente Approval A', 9108, 'reprovado', 30,
    0, null, 'retirada', 'Origem A', null, 0, 0, '[]'::jsonb,
    '2026-08-26 10:00:00+00'
  );

insert into public.quote_items (
  id, quote_id, product_id, product_name, quantity, unit_price, total_price, details
) values
  (
    'quote-approval-item-a', 'quote-approval-a', null, 'Banner Premium', 2, 45, 90,
    '{"width":1.2,"height":0.8,"production_days":3,"pricing_snapshot":{"source":"approved_quote"},"configuration_snapshot":{"sale_mode":"manual_quote_item","quantity_tier":2,"unit_price":45,"total_price":90,"display_label":"Banner Premium"}}'::jsonb
  ),
  ('quote-approval-item-b', 'quote-approval-b', null, 'Produto B', 1, 50, 50, '{}'::jsonb),
  ('quote-approval-item-no-customer', 'quote-approval-no-customer', null, 'Produto sem cliente', 1, 30, 30, '{}'::jsonb),
  ('quote-approval-item-rejected', 'quote-approval-rejected', null, 'Produto rejeitado', 1, 30, 30, '{}'::jsonb),
  ('quote-approval-item-rollback', 'quote-approval-rollback', null, 'Rollback Trigger', 1, 30, 30, '{}'::jsonb),
  ('quote-approval-item-null-status', 'quote-approval-null-status', null, 'Produto sem status', 1, 30, 30, '{}'::jsonb),
  ('quote-approval-item-linked-rejected', 'quote-approval-linked-rejected', null, 'Produto vinculado rejeitado', 1, 30, 30, '{}'::jsonb);

insert into public.orders (
  id, company_id, customer_id, customer_name, number, status, total_amount,
  paid_amount, payment_status, shipping_cost, source_quote_id
) values (
  'quote-approval-existing-conflict-order',
  (select company_id from public.profiles where auth_user_id = '46000000-0000-0000-0000-000000000001'),
  'quote-approval-customer-a', 'Cliente Approval A', 'PED-9910',
  'aguardando_pagamento', 30, 0, 'pendente', 0, 'quote-approval-linked-rejected'
);

create function pg_temp.fail_quote_order_item()
returns trigger
language plpgsql
as $$
begin
  if new.product_name = 'Rollback Trigger' then
    raise exception using errcode = 'P0001', message = 'TEST_ORDER_ITEM_FAILURE';
  end if;
  return new;
end;
$$;

create trigger quote_approval_force_item_failure
before insert on public.order_items
for each row execute function pg_temp.fail_quote_order_item();

-- Flush fixture triggers while there is no authenticated actor. Otherwise the
-- deferred tenant guard would evaluate tenant-B fixtures using tenant-A claims.
set constraints phase4b_audit_business_mutation immediate;
set constraints phase4b_audit_business_mutation deferred;

select set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

create temporary table quote_approval_result on commit drop as
select public.approve_quote_and_create_order('quote-approval-a') as payload;

select is((select payload -> 'quote' ->> 'status' from quote_approval_result), 'aprovado', 'approval marks the quote approved');
select is((select payload -> 'order' ->> 'source_quote_id' from quote_approval_result), 'quote-approval-a', 'created order links to the source quote');
select is((select count(*)::integer from public.orders where source_quote_id = 'quote-approval-a'), 1, 'approval creates exactly one order');
select is((select total_amount from public.orders where source_quote_id = 'quote-approval-a'), 105.50::numeric, 'order preserves the approved net total');
select is(
  (
    select
      coalesce((select sum(oi.total_price) from public.order_items oi where oi.order_id = o.id), 0)
      + coalesce((select sum((service ->> 'total_price')::numeric) from jsonb_array_elements(o.additional_services) service), 0)
      + o.shipping_cost
      - o.total_amount
    from public.orders o
    where o.source_quote_id = 'quote-approval-a'
  ),
  (select discount from public.quotes where id = 'quote-approval-a'),
  'order gross components reconcile exactly to the approved quote discount'
);
select is((select shipping_cost from public.orders where source_quote_id = 'quote-approval-a'), 10::numeric, 'order preserves shipping cost');
select is((select additional_services from public.orders where source_quote_id = 'quote-approval-a'), '[{"id":"service-a","name":"Arte","quantity":1,"unit_price":20,"total_price":20,"is_custom":true}]'::jsonb, 'order preserves additional services');
select is((select count(*)::integer from public.order_items oi join public.orders o on o.id = oi.order_id where o.source_quote_id = 'quote-approval-a'), 1, 'approval copies every quote item once');
select is((select details from public.order_items oi join public.orders o on o.id = oi.order_id where o.source_quote_id = 'quote-approval-a'), (select details from public.quote_items where id = 'quote-approval-item-a'), 'order item preserves the canonical pricing and configuration snapshots');
select is((select unit_price from public.order_items oi join public.orders o on o.id = oi.order_id where o.source_quote_id = 'quote-approval-a'), 45::numeric, 'order item preserves unit price precision');
select is((select total_price from public.order_items oi join public.orders o on o.id = oi.order_id where o.source_quote_id = 'quote-approval-a'), 90::numeric, 'order item preserves total price');
select is((select status from public.orders where source_quote_id = 'quote-approval-a'), 'aguardando_pagamento', 'conversion preserves the official pre-payment order status');
select is((select count(*)::integer from public.production_queue pq join public.orders o on o.id = pq.order_id where o.source_quote_id = 'quote-approval-a'), 0, 'approval does not bypass the official payment-to-production transition');

create temporary table quote_approval_repeat on commit drop as
select public.approve_quote_and_create_order('quote-approval-a') as payload;

select is((select payload -> 'order' ->> 'id' from quote_approval_repeat), (select payload -> 'order' ->> 'id' from quote_approval_result), 'repeat approval returns the original order');
select is((select count(*)::integer from public.orders where source_quote_id = 'quote-approval-a'), 1, 'repeat approval cannot duplicate the order');
select is((select count(*)::integer from public.order_items oi join public.orders o on o.id = oi.order_id where o.source_quote_id = 'quote-approval-a'), 1, 'repeat approval cannot duplicate order items');

set constraints phase4b_audit_business_mutation immediate;
set constraints phase4b_audit_business_mutation deferred;
select is((select count(*)::integer from public.audit_logs where entity_id = 'quote-approval-a' and action = 'quote.approved'), 1, 'approval appends one quote approval audit event');
select is((select count(*)::integer from public.audit_logs a join public.orders o on o.id = a.entity_id where o.source_quote_id = 'quote-approval-a' and a.action = 'order.created'), 1, 'approval appends one order creation audit event');

select throws_ok(
  $$select public.approve_quote_and_create_order('quote-approval-no-customer')$$,
  '22023',
  'QUOTE_CUSTOMER_REQUIRED',
  'a quote without a customer cannot be converted'
);
select throws_ok(
  $$select public.approve_quote_and_create_order('quote-approval-no-items')$$,
  '22023',
  'QUOTE_ITEMS_REQUIRED',
  'a quote without items cannot be converted'
);
select throws_ok(
  $$select public.approve_quote_and_create_order('quote-approval-rejected')$$,
  '22023',
  'QUOTE_STATUS_NOT_APPROVABLE',
  'a rejected quote is not in an approvable state'
);
select throws_ok(
  $$select public.approve_quote_and_create_order('quote-approval-null-status')$$,
  '22023',
  'QUOTE_STATUS_NOT_APPROVABLE',
  'a quote with a missing status is not approvable'
);
select throws_ok(
  $$select public.approve_quote_and_create_order('quote-approval-linked-rejected')$$,
  '22023',
  'QUOTE_ORDER_STATE_CONFLICT',
  'a historical order linked to a non-approved quote is not reconciled implicitly'
);
select throws_ok(
  $$select public.approve_quote_and_create_order('quote-approval-rollback')$$,
  'P0001',
  'TEST_ORDER_ITEM_FAILURE',
  'an item creation failure aborts the conversion'
);
select is((select count(*)::integer from public.orders where source_quote_id = 'quote-approval-rollback'), 0, 'rollback removes the partially inserted order');
select is((select status from public.quotes where id = 'quote-approval-rollback'), 'pendente', 'rollback leaves the quote status unchanged');

select throws_ok(
  $$select public.approve_quote_and_create_order('quote-approval-b')$$,
  'P0002',
  'QUOTE_NOT_FOUND',
  'cross-tenant quote identifiers are not disclosed'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.approve_quote_and_create_order('quote-approval-a')$$,
  '42501',
  'QUOTE_APPROVAL_NOT_AUTHORIZED',
  'a role without quote access cannot approve a quote'
);

select ok((select prosecdef from pg_proc where oid = 'public.approve_quote_and_create_order(text)'::regprocedure), 'approval command is SECURITY DEFINER');
select is((select proconfig[1] from pg_proc where oid = 'public.approve_quote_and_create_order(text)'::regprocedure), 'search_path=""', 'approval command pins an empty search path');
select function_privs_are('public', 'approve_quote_and_create_order', array['text'], 'authenticated', array['EXECUTE']);
select function_privs_are('public', 'approve_quote_and_create_order', array['text'], 'anon', array[]::text[]);
select ok(not has_table_privilege('authenticated', 'public.orders', 'INSERT'), 'authenticated still cannot insert orders directly');
select ok(not has_table_privilege('authenticated', 'public.order_items', 'INSERT'), 'authenticated still cannot insert order items directly');
select ok(not has_table_privilege('authenticated', 'public.orders', 'UPDATE'), 'authenticated still cannot update orders directly');
select ok(not has_table_privilege('authenticated', 'public.order_items', 'UPDATE'), 'authenticated still cannot update order items directly');

select * from finish();
rollback;
