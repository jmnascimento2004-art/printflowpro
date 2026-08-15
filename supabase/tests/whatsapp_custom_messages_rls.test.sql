begin;
select plan(34);

select has_table('public', 'whatsapp_custom_messages', 'custom messages table exists');
select col_is_pk('public', 'whatsapp_custom_messages', 'id', 'id is the primary key');
select col_type_is('public', 'whatsapp_custom_messages', 'company_id', 'text', 'company id matches tenant ids');
select col_type_is('public', 'whatsapp_custom_messages', 'context_type', 'text', 'context type uses constrained text');
select has_index('public', 'whatsapp_custom_messages', 'whatsapp_custom_messages_company_name_unique', 'tenant normalized name index exists');
select has_index('public', 'whatsapp_custom_messages', 'whatsapp_custom_messages_company_updated_idx', 'tenant listing index exists');

select ok(
  coalesce((
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'whatsapp_custom_messages'
  ), false),
  'RLS is enabled'
);

select policies_are(
  'public',
  'whatsapp_custom_messages',
  array[
    'whatsapp_custom_messages_tenant_delete',
    'whatsapp_custom_messages_tenant_insert',
    'whatsapp_custom_messages_tenant_select',
    'whatsapp_custom_messages_tenant_update'
  ]
);

select policy_roles_are('public', 'whatsapp_custom_messages', 'whatsapp_custom_messages_tenant_select', array['authenticated']);
select policy_roles_are('public', 'whatsapp_custom_messages', 'whatsapp_custom_messages_tenant_insert', array['authenticated']);
select policy_roles_are('public', 'whatsapp_custom_messages', 'whatsapp_custom_messages_tenant_update', array['authenticated']);
select policy_roles_are('public', 'whatsapp_custom_messages', 'whatsapp_custom_messages_tenant_delete', array['authenticated']);
select policy_cmd_is('public', 'whatsapp_custom_messages', 'whatsapp_custom_messages_tenant_select'::name, 'SELECT');
select policy_cmd_is('public', 'whatsapp_custom_messages', 'whatsapp_custom_messages_tenant_insert'::name, 'INSERT');
select policy_cmd_is('public', 'whatsapp_custom_messages', 'whatsapp_custom_messages_tenant_update'::name, 'UPDATE');
select policy_cmd_is('public', 'whatsapp_custom_messages', 'whatsapp_custom_messages_tenant_delete'::name, 'DELETE');

select table_privs_are('public', 'whatsapp_custom_messages', 'public', array[]::text[]);
select table_privs_are('public', 'whatsapp_custom_messages', 'anon', array[]::text[]);
select table_privs_are('public', 'whatsapp_custom_messages', 'authenticated', array['DELETE', 'INSERT', 'SELECT', 'UPDATE']);

select has_function('private', 'current_user_can_mutate_whatsapp_custom_messages', array['text']);
select function_returns('private', 'current_user_can_mutate_whatsapp_custom_messages', array['text'], 'boolean');
select ok(not coalesce((
  select p.prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'current_user_can_mutate_whatsapp_custom_messages'
    and pg_get_function_identity_arguments(p.oid) = 'p_path text'
), true), 'permission helper is SECURITY INVOKER');
select function_privs_are('private', 'current_user_can_mutate_whatsapp_custom_messages', array['text'], 'authenticated', array['EXECUTE']);
select function_privs_are('private', 'current_user_can_mutate_whatsapp_custom_messages', array['text'], 'anon', array[]::text[]);
select function_privs_are('private', 'current_user_can_mutate_whatsapp_custom_messages', array['text'], 'public', array[]::text[]);

select has_function(
  'public',
  'update_whatsapp_custom_message_atomic',
  array['text', 'text', 'text', 'text', 'timestamp with time zone']
);
select ok(not coalesce((
  select p.prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'update_whatsapp_custom_message_atomic'
    and pg_get_function_identity_arguments(p.oid) =
      'p_message_id text, p_name text, p_content text, p_context_type text, p_expected_updated_at timestamp with time zone'
), true), 'atomic update is SECURITY INVOKER');
select function_privs_are(
  'public',
  'update_whatsapp_custom_message_atomic',
  array['text', 'text', 'text', 'text', 'timestamp with time zone'],
  'authenticated',
  array['EXECUTE']
);
select function_privs_are(
  'public',
  'update_whatsapp_custom_message_atomic',
  array['text', 'text', 'text', 'text', 'timestamp with time zone'],
  'anon',
  array[]::text[]
);
select function_privs_are(
  'public',
  'update_whatsapp_custom_message_atomic',
  array['text', 'text', 'text', 'text', 'timestamp with time zone'],
  'public',
  array[]::text[]
);

select ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'whatsapp_custom_messages'
    and column_name in ('event_key', 'eventKey', 'system_event')
), 'no system event key column exists');
select ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'whatsapp_custom_messages' and column_name in ('active', 'is_active')
), 'no active flag exists in v1');
select ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'whatsapp_custom_messages' and column_name = 'created_by'
), 'no unused created_by column exists');
select ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'whatsapp_custom_messages' and column_name = 'updated_by'
), 'no unused updated_by column exists');

select * from finish();
rollback;
