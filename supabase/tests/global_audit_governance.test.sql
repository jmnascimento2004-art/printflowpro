begin;
select plan(34);

select col_not_null('public', 'audit_logs', 'actor_name', 'actor snapshot name remains required');
select col_not_null('public', 'audit_logs', 'actor_role', 'actor snapshot role remains required');
select col_is_null('public', 'audit_logs', 'actor_user_id', 'SYSTEM events may have no human auth id');
select has_index('public', 'audit_logs', 'audit_logs_company_entity_created_idx', 'entity timeline index exists');
select has_index('public', 'audit_logs', 'audit_logs_company_actor_created_idx', 'actor timeline index exists');
select table_privs_are('public', 'audit_logs', 'authenticated', array['SELECT']);
select table_privs_are('public', 'audit_logs', 'anon', array[]::text[]);
select table_privs_are('public', 'audit_logs', 'service_role', array['SELECT']);
select policies_are('public', 'audit_logs', array['audit_logs_admin_tenant_select']);
select is((select c.confdeltype::text from pg_constraint c where c.conname = 'audit_logs_company_id_fkey' and c.conrelid = 'public.audit_logs'::regclass), 'r', 'company deletion cannot cascade-delete audit history');

select has_function('private', 'phase4e_changed_values', array['jsonb','jsonb']);
select function_privs_are('private', 'phase4e_changed_values', array['jsonb','jsonb'], 'authenticated', array[]::text[]);
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'phase4b_audit_business_mutation'), 'audit trigger is SECURITY DEFINER');
select is((select proconfig[1] from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'phase4b_audit_business_mutation'), 'search_path=""', 'audit trigger pins an empty search path');

select has_trigger('public', 'suppliers', 'phase4b_audit_business_mutation', 'supplier mutations are covered');
select has_trigger('public', 'profiles', 'phase4b_audit_business_mutation', 'user mutations are covered');
select has_trigger('public', 'quotes', 'phase4b_audit_business_mutation', 'quote direct transitions are covered');
select has_trigger('public', 'orders', 'phase4b_audit_business_mutation', 'order direct transitions are covered');
select has_trigger('public', 'production_queue', 'phase4b_audit_business_mutation', 'production responsibility is covered');
select has_trigger('public', 'company_default_services', 'phase4b_audit_business_mutation', 'default service mutations are covered');
select has_trigger('public', 'whatsapp_message_templates', 'phase4b_audit_business_mutation', 'WhatsApp templates are covered');
select has_trigger('public', 'whatsapp_settings', 'phase4b_audit_business_mutation', 'WhatsApp settings are covered');
select has_trigger('public', 'whatsapp_custom_messages', 'phase4b_audit_business_mutation', 'WhatsApp custom messages are covered');

select is((select tgdeferrable from pg_trigger where tgrelid = 'public.quotes'::regclass and tgname = 'phase4b_audit_business_mutation'), true, 'quote trigger defers generic audit until rich aggregate deduplication');
select is((select tgdeferrable from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'phase4b_audit_business_mutation'), true, 'order trigger defers generic audit until rich aggregate deduplication');

select ok((select position('pix_key' in pg_get_functiondef(p.oid)) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'phase4b_audit_business_mutation'), 'PIX receives explicit sanitization');
select ok((select position('content_fingerprint' in pg_get_functiondef(p.oid)) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'phase4b_audit_business_mutation'), 'message content is represented by a fingerprint');

select lives_ok($$set local role authenticated$$, 'authenticated role remains usable');
reset role;
select ok(not has_table_privilege('authenticated', 'public.audit_logs', 'INSERT'), 'authenticated cannot forge audit rows');
select ok(not has_table_privilege('authenticated', 'public.audit_logs', 'UPDATE'), 'authenticated cannot alter audit rows');
select ok(not has_table_privilege('authenticated', 'public.audit_logs', 'DELETE'), 'authenticated cannot delete audit rows');
select ok(not has_table_privilege('anon', 'public.audit_logs', 'SELECT'), 'anonymous users cannot read audit rows');
select ok(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_logs' and cmd <> 'SELECT'), 'audit log has no write policy');
select ok(not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'audit_logs' and indexdef ilike '%using gin%'), 'audit JSON is not indiscriminately GIN-indexed');

select * from finish();
rollback;
