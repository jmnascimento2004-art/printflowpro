begin;
select plan(34);

select has_table('public', 'audit_logs', 'global audit log table exists');
select col_is_pk('public', 'audit_logs', 'id', 'audit id is the primary key');
select col_type_is('public', 'audit_logs', 'company_id', 'text', 'audit tenant id matches company ids');
select col_type_is('public', 'audit_logs', 'actor_user_id', 'uuid', 'actor auth id is preserved');
select col_type_is('public', 'audit_logs', 'old_values', 'jsonb', 'old values are structured');
select col_type_is('public', 'audit_logs', 'new_values', 'jsonb', 'new values are structured');
select col_type_is('public', 'audit_logs', 'metadata', 'jsonb', 'metadata is structured');
select has_index('public', 'audit_logs', 'audit_logs_company_created_idx', 'tenant timeline index exists');
select has_index('public', 'audit_logs', 'audit_logs_company_filters_idx', 'audit filters index exists');

select ok(coalesce((
  select c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'audit_logs'
), false), 'audit RLS is enabled');

select policies_are('public', 'audit_logs', array['audit_logs_admin_tenant_select']);
select policy_roles_are('public', 'audit_logs', 'audit_logs_admin_tenant_select', array['authenticated']);
select policy_cmd_is('public', 'audit_logs', 'audit_logs_admin_tenant_select'::name, 'SELECT');
select table_privs_are('public', 'audit_logs', 'public', array[]::text[]);
select table_privs_are('public', 'audit_logs', 'anon', array[]::text[]);
select table_privs_are('public', 'audit_logs', 'authenticated', array['SELECT']);

select has_function('private', 'current_user_can_access_operational_path', array['text']);
select function_returns('private', 'current_user_can_access_operational_path', array['text'], 'boolean');
select ok(coalesce((
  select p.prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'current_user_can_access_operational_path'
    and pg_get_function_identity_arguments(p.oid) = 'p_path text'
), false), 'permission helper is SECURITY DEFINER');
select function_privs_are('private', 'current_user_can_access_operational_path', array['text'], 'authenticated', array['EXECUTE']);
select function_privs_are('private', 'current_user_can_access_operational_path', array['text'], 'anon', array[]::text[]);
select function_privs_are('private', 'current_user_can_access_operational_path', array['text'], 'public', array[]::text[]);

select has_function('public', 'transition_production_stage', array['text', 'text', 'timestamp with time zone']);
select ok(coalesce((
  select p.prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'transition_production_stage'
    and pg_get_function_identity_arguments(p.oid) =
      'p_item_id text, p_next_status text, p_expected_updated_at timestamp with time zone'
), false), 'stage transition is SECURITY DEFINER');
select function_privs_are('public', 'transition_production_stage', array['text', 'text', 'timestamp with time zone'], 'authenticated', array['EXECUTE']);
select function_privs_are('public', 'transition_production_stage', array['text', 'text', 'timestamp with time zone'], 'anon', array[]::text[]);
select function_privs_are('public', 'transition_production_stage', array['text', 'text', 'timestamp with time zone'], 'public', array[]::text[]);

select has_function('public', 'ensure_production_queue_for_order', array['text']);
select ok(coalesce((
  select p.prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'ensure_production_queue_for_order'
    and pg_get_function_identity_arguments(p.oid) = 'p_order_id text'
), false), 'queue creation is SECURITY DEFINER');
select function_privs_are('public', 'ensure_production_queue_for_order', array['text'], 'authenticated', array['EXECUTE']);
select function_privs_are('public', 'ensure_production_queue_for_order', array['text'], 'anon', array[]::text[]);

select table_privs_are('public', 'production_queue', 'anon', array[]::text[]);
select table_privs_are('public', 'production_queue', 'authenticated', array['DELETE', 'SELECT']);
select column_privs_are('public', 'production_queue', 'responsible_name', 'authenticated', array['SELECT', 'UPDATE']);

select * from finish();
rollback;
