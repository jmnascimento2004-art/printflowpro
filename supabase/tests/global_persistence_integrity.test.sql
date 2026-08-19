begin;
select plan(35);

select has_column('public', 'store_banners', 'updated_at', 'banners expose a concurrency token');
select has_index('public', 'shipments', 'shipments_company_order_unique', 'shipment creation is idempotent per tenant/order');
select has_index('public', 'cash_register_sessions', 'cash_register_one_open_session_per_company', 'one open register is enforced per tenant');
select has_function('private', 'current_user_can_access_path', array['text']);
select function_returns('private', 'current_user_can_access_path', array['text'], 'boolean');
select function_privs_are('private', 'current_user_can_access_path', array['text'], 'authenticated', array['EXECUTE']);
select function_privs_are('private', 'current_user_can_access_path', array['text'], 'anon', array[]::text[]);
select has_function('public', 'adjust_inventory_stock', array['text','numeric','text','text','numeric','timestamp with time zone']);
select has_function('public', 'transition_shipment', array['text','text','text','text','timestamp with time zone']);
select has_function('public', 'settle_financial_transaction', array['text','text','timestamp with time zone']);
select has_function('public', 'operate_cash_register', array['text','numeric','text','timestamp with time zone']);
select has_function('public', 'save_role_permissions', array['jsonb','jsonb']);
select has_function('public', 'transition_order_status_phase4b', array['text','text','timestamp with time zone']);
select has_function('public', 'record_order_payment_phase4b', array['text','numeric','text','text','timestamp with time zone','text','timestamp with time zone']);
select function_privs_are('public', 'adjust_inventory_stock', array['text','numeric','text','text','numeric','timestamp with time zone'], 'authenticated', array['EXECUTE']);
select function_privs_are('public', 'adjust_inventory_stock', array['text','numeric','text','text','numeric','timestamp with time zone'], 'anon', array[]::text[]);
select function_privs_are('public', 'operate_cash_register', array['text','numeric','text','timestamp with time zone'], 'public', array[]::text[]);

select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'adjust_inventory_stock'), 'inventory command is security definer');
select is((select proconfig[1] from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'adjust_inventory_stock'), 'search_path=""', 'inventory command pins an empty search path');
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'operate_cash_register'), 'cash command is security definer');
select is((select proconfig[1] from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'operate_cash_register'), 'search_path=""', 'cash command pins an empty search path');
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'record_order_payment_phase4b'), 'payment command is security definer');
select is((select proconfig[1] from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'record_order_payment_phase4b'), 'search_path=""', 'payment command pins an empty search path');

select has_trigger('public', 'products', 'phase4b_audit_business_mutation', 'product persistence is audited at the authoritative layer');
select has_trigger('public', 'financial_transactions', 'phase4b_audit_business_mutation', 'financial persistence is audited at the authoritative layer');
select has_trigger('public', 'stock_movements', 'phase4b_audit_business_mutation', 'inventory movements are audited atomically');
select has_trigger('public', 'shipments', 'phase4b_audit_business_mutation', 'shipment transitions are audited atomically');
select has_trigger('public', 'role_permissions', 'phase4b_audit_business_mutation', 'permission changes are audited atomically');
select has_trigger('public', 'cash_register_sessions', 'phase4b_audit_business_mutation', 'cash session changes are audited atomically');
select has_trigger('public', 'store_banners', 'phase4b_audit_business_mutation', 'catalog banner changes are audited atomically');
select has_trigger('public', 'customers', 'phase4b_audit_business_mutation', 'customer mutations are audited atomically');
select has_function('public', 'save_order_with_items_phase4b', array['jsonb','jsonb','timestamp with time zone']);
select has_function('public', 'save_quote_with_items_phase4b', array['jsonb','jsonb','timestamp with time zone']);
select function_privs_are('public', 'save_order_with_items', array['jsonb','jsonb'], 'authenticated', array[]::text[]);
select function_privs_are('public', 'save_quote_with_items', array['jsonb','jsonb'], 'authenticated', array[]::text[]);

select * from finish();
rollback;
