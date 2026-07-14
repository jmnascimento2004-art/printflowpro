-- Recovery operacional da migration 20260712174000_harden_default_privileges.sql
-- Objetivo: manter defaults seguros e orientar correção objeto por objeto.
-- Pré-condições: executar como postgres. Defaults de supabase_admin exigem ação
-- administrativa separada, sem elevação por este script.
-- Sintoma: objeto novo legítimo retorna permission denied.
-- Preservar defaults restritos; conceder no change-set do objeto apenas o grant
-- nominal depois de RLS/policies. Proibido defaults amplos, execução pública,
-- CRUD anônimo ou migrations de supabase_admin sem auditoria posterior.

-- Defaults globais também precisam permanecer restritos: REVOKE por schema não
-- neutraliza privilégios concedidos globalmente.
alter default privileges for role postgres
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres
  revoke all on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated;

-- Modelos deliberadamente inertes até revisão do objeto específico:
-- grant select on table public.<tabela_nova_com_rls> to authenticated;
-- grant usage, select on sequence public.<sequencia> to authenticated;
-- grant execute on function public.<rpc>(<assinatura>) to authenticated;

select pg_get_userbyid(d.defaclrole) as owner_name,
  coalesce(n.nspname, 'GLOBAL') as schema_name, d.defaclobjtype, d.defaclacl
from pg_default_acl as d
left join pg_namespace as n on n.oid = d.defaclnamespace
where pg_get_userbyid(d.defaclrole) in ('postgres','supabase_admin')
  and (n.nspname = 'public' or d.defaclnamespace = 0)
order by owner_name, schema_name, d.defaclobjtype;

select n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relacl
from pg_class as c join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
order by c.relname;
