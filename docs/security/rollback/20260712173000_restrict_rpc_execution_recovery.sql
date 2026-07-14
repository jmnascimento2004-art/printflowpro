-- Recovery seguro da migration 20260712173000_restrict_rpc_execution.sql
-- Objetivo: restaurar EXECUTE apenas nas RPCs comprovadas pelo aplicativo.
-- Pré-condições: assinaturas, owner, SECURITY DEFINER e search_path auditados.
-- Sintomas: login/provisionamento, criação de orçamento/pedido, aprovação ou
-- cadastro da loja retornam permission denied. Não substitui corpos de funções.
-- Proibido execução global, acesso público/anônimo, mudar SECURITY DEFINER,
-- enfraquecer search_path ou expor helpers privados desnecessários.

revoke all on function public.ensure_store_customer_account(text,text,text,text,text,text,text,date,text,text,text,boolean,boolean) from public, anon;
revoke all on function public.save_quote_with_items(jsonb,jsonb) from public, anon;
revoke all on function public.save_order_with_items(jsonb,jsonb) from public, anon;
revoke all on function public.approve_quote_and_create_order(text) from public, anon;
revoke all on function public.provision_current_auth_user() from public, anon;
revoke all on function private.current_company_id() from public, anon;
revoke all on function private.current_user_role() from public, anon;
revoke all on function private.current_store_customer_id() from public, anon;
revoke all on function private.current_store_company_id() from public, anon;

grant execute on function public.ensure_store_customer_account(text,text,text,text,text,text,text,date,text,text,text,boolean,boolean) to authenticated;
grant execute on function public.save_quote_with_items(jsonb,jsonb) to authenticated;
grant execute on function public.save_order_with_items(jsonb,jsonb) to authenticated;
grant execute on function public.approve_quote_and_create_order(text) to authenticated;
grant execute on function public.provision_current_auth_user() to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.current_company_id() to authenticated;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.current_store_customer_id() to authenticated;
grant execute on function private.current_store_company_id() to authenticated;

select p.oid::regprocedure as signature, pg_get_userbyid(p.proowner) as owner_name,
  p.prosecdef, p.proconfig, p.proacl
from pg_proc as p
where p.oid in (
  'public.ensure_store_customer_account(text,text,text,text,text,text,text,date,text,text,text,boolean,boolean)'::regprocedure,
  'public.save_quote_with_items(jsonb,jsonb)'::regprocedure,
  'public.save_order_with_items(jsonb,jsonb)'::regprocedure,
  'public.approve_quote_and_create_order(text)'::regprocedure,
  'public.provision_current_auth_user()'::regprocedure,
  'private.current_company_id()'::regprocedure,
  'private.current_user_role()'::regprocedure,
  'private.current_store_customer_id()'::regprocedure,
  'private.current_store_company_id()'::regprocedure)
order by p.oid::regprocedure::text;
