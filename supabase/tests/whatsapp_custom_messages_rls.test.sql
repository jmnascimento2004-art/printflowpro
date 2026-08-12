begin;
select plan(23);

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
select policy_cmd_is('public', 'whatsapp_custom_messages', 'whatsapp_custom_messages_tenant_select', 'SELECT');
select policy_cmd_is('public', 'whatsapp_custom_messages', 'whatsapp_custom_messages_tenant_insert', 'INSERT');
select policy_cmd_is('public', 'whatsapp_custom_messages', 'whatsapp_custom_messages_tenant_update', 'UPDATE');
select policy_cmd_is('public', 'whatsapp_custom_messages', 'whatsapp_custom_messages_tenant_delete', 'DELETE');

select table_privs_are('public', 'whatsapp_custom_messages', 'public', array[]::text[]);
select table_privs_are('public', 'whatsapp_custom_messages', 'anon', array[]::text[]);
select table_privs_are('public', 'whatsapp_custom_messages', 'authenticated', array['DELETE', 'INSERT', 'SELECT', 'UPDATE']);

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
