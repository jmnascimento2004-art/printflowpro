begin;
select plan(17);

select has_function('private', 'can_store_customer_manage_favorite', array['text', 'text', 'text']);
select function_returns('private', 'can_store_customer_manage_favorite', array['text', 'text', 'text'], 'boolean');
select is_definer('private', 'can_store_customer_manage_favorite', array['text', 'text', 'text']);
select function_privs_are('private', 'can_store_customer_manage_favorite', array['text', 'text', 'text'], 'authenticated', array['EXECUTE']);
select function_privs_are('private', 'can_store_customer_manage_favorite', array['text', 'text', 'text'], 'anon', array[]::text[]);
select function_privs_are('private', 'can_store_customer_manage_favorite', array['text', 'text', 'text'], 'public', array[]::text[]);
select policies_are('public', 'store_customer_favorites', array['store_favorites_self_delete', 'store_favorites_self_insert', 'store_favorites_self_select']);
select policy_roles_are('public', 'store_customer_favorites', 'store_favorites_self_insert', array['authenticated']);
select policy_cmd_is('public', 'store_customer_favorites', 'store_favorites_self_insert', 'INSERT', 'favorites insert policy command');
select policy_cmd_is('public', 'store_customer_favorites', 'store_favorites_self_select', 'SELECT', 'favorites select policy command');
select policy_cmd_is('public', 'store_customer_favorites', 'store_favorites_self_delete', 'DELETE', 'favorites delete policy command');
select table_privs_are('public', 'store_customer_favorites', 'anon', array[]::text[]);
select table_privs_are('public', 'store_customer_favorites', 'authenticated', array['DELETE', 'INSERT', 'SELECT']);
select col_is_pk('public', 'store_customer_favorites', 'id', 'favorites id is the primary key');
select col_type_is('public', 'store_customer_favorites', 'product_id', 'text', 'favorites product id uses text');
select has_index('public', 'store_customer_favorites', 'idx_store_customer_favorites_customer', 'favorites customer index exists');
select has_index('public', 'store_customer_favorites', 'idx_store_customer_favorites_product', 'favorites product index exists');

select * from finish();
rollback;
