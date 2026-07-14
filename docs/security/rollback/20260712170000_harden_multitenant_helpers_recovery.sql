-- Recovery seguro da migration 20260712170000_harden_multitenant_helpers.sql
-- Objetivo: reparar somente os helpers de contexto quando a identificação da
-- empresa ou do papel do usuário falhar após o hardening.
-- Pré-condições: executar como owner das funções; confirmar auth.uid() válido e
-- uma única profile ativa por usuário/empresa. Não executar por erro de RLS.
-- Sintomas: current_company_id/current_user_role retornam NULL ou falham por
-- resolução de nomes. Objetos: private.current_company_id() e
-- private.current_user_role(). Owner esperado: postgres.
-- Validação antes/depois: consultar pg_proc, pg_namespace, proowner, prosecdef,
-- proconfig e proacl para as duas assinaturas; testar com JWT de uma conta de teste.
-- Ações proibidas: ampliar execução a papéis públicos, usar search_path mutável,
-- desqualificar tabelas, alterar dados ou desabilitar RLS.

create or replace function private.current_company_id()
returns text language sql stable security definer set search_path = pg_catalog
as $$
  select p.company_id from public.profiles as p
  where p.auth_user_id = (select auth.uid()) and p.active = true
  order by p.id limit 1
$$;

create or replace function private.current_user_role()
returns text language sql stable security definer set search_path = pg_catalog
as $$
  select p.role from public.profiles as p
  where p.auth_user_id = (select auth.uid()) and p.active = true
  order by p.id limit 1
$$;

alter function private.current_company_id() owner to postgres;
alter function private.current_user_role() owner to postgres;
revoke all on function private.current_company_id() from public, anon;
revoke all on function private.current_user_role() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.current_company_id() to authenticated;
grant execute on function private.current_user_role() to authenticated;

select n.nspname as schema_name, p.proname,
  pg_get_userbyid(p.proowner) as owner_name, p.prosecdef,
  p.proconfig, p.proacl
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where p.oid in ('private.current_company_id()'::regprocedure,
                'private.current_user_role()'::regprocedure)
order by p.proname;
