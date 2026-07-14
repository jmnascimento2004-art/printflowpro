-- Recovery seguro da migration 20260712172000_enable_multitenant_rls.sql
-- Objetivo: substituir somente policies tenant defeituosas, mantendo RLS ativa.
-- Pré-condições: private.current_company_id() e current_user_role() validados;
-- grants anônimos revogados; executar como owner das tabelas.
-- Sintomas: 403/zero linhas para o tenant correto, recursão de policy ou tentativa
-- legítima bloqueada. Nunca criar acesso genérico de emergência.
-- Validação: pg_class.relrowsecurity=true nas 19 tabelas, policies somente para
-- authenticated, isolamento entre duas empresas e tentativa de trocar company_id.
-- Ações proibidas: desligar RLS, policy aberta, remover WITH CHECK, liberar anon,
-- alterar dados ou restaurar policies pré-rollout sem auditoria.

-- Matriz nominal de recovery:
-- cash_register_sessions: S/I/U/D por company_id; caixa/PDV.
-- cash_register_transactions: S/I/U/D via cash_register_sessions(session_id); caixa.
-- categories: S/I/U/D por company_id; catálogo.
-- companies: S por id; U por id + papel admin/gerente; I/D ausentes por desenho.
-- customers: S/I/U/D por company_id; CRM.
-- financial_transactions: S/I/U/D por company_id; financeiro.
-- order_items: S/I/U/D via orders(order_id); pedidos.
-- orders: S/I/U/D por company_id + S própria de cliente da loja; pedidos/loja.
-- pickup_points: S/I/U/D por company_id; retiradas.
-- production_queue: S/I/U/D por company_id; produção.
-- products: S/I/U/D por company_id; catálogo.
-- quote_items: S/I/U/D via quotes(quote_id); orçamentos.
-- quotes: S/I/U/D por company_id + S própria de cliente da loja; orçamentos/loja.
-- role_permissions: S por company_id; I/U/D por company_id + admin/gerente.
-- settings: S/I/U/D por company_id; configurações.
-- shipments: S/I/U/D por company_id; expedição.
-- stock_movements: S/I/U/D por company_id; estoque.
-- store_banners: S/I/U/D por company_id; catálogo público via rota servidor.
-- suppliers: S/I/U/D por company_id; fornecedores.
-- Em todas: testar tenant A, tenant B, JWT sem profile, troca de company_id e papel
-- anônimo. Falha aceitável é negação; vazamento entre empresas é parada imediata.

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'cash_register_sessions','categories','customers','financial_transactions',
    'orders','pickup_points','production_queue','products','quotes',
    'settings','shipments','stock_movements','store_banners',
    'suppliers'
  ] loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('drop policy if exists %I on public.%I', 'tenant_'||target_table||'_select', target_table);
    execute format('drop policy if exists %I on public.%I', 'tenant_'||target_table||'_insert', target_table);
    execute format('drop policy if exists %I on public.%I', 'tenant_'||target_table||'_update', target_table);
    execute format('drop policy if exists %I on public.%I', 'tenant_'||target_table||'_delete', target_table);
    execute format('create policy %I on public.%I for select to authenticated using (company_id = (select private.current_company_id()))', 'tenant_'||target_table||'_select', target_table);
    execute format('create policy %I on public.%I for insert to authenticated with check (company_id = (select private.current_company_id()))', 'tenant_'||target_table||'_insert', target_table);
    execute format('create policy %I on public.%I for update to authenticated using (company_id = (select private.current_company_id())) with check (company_id = (select private.current_company_id()))', 'tenant_'||target_table||'_update', target_table);
    execute format('create policy %I on public.%I for delete to authenticated using (company_id = (select private.current_company_id()))', 'tenant_'||target_table||'_delete', target_table);
  end loop;
end;
$$;

alter table public.companies enable row level security;
drop policy if exists tenant_companies_select on public.companies;
drop policy if exists tenant_companies_insert on public.companies;
drop policy if exists tenant_companies_update on public.companies;
drop policy if exists tenant_companies_delete on public.companies;
create policy tenant_companies_select on public.companies
  for select to authenticated
  using (id = (select private.current_company_id()));
create policy tenant_companies_update on public.companies
  for update to authenticated
  using (id = (select private.current_company_id())
    and (select private.current_user_role()) in ('admin','gerente'))
  with check (id = (select private.current_company_id())
    and (select private.current_user_role()) in ('admin','gerente'));

alter table public.role_permissions enable row level security;
drop policy if exists tenant_role_permissions_select on public.role_permissions;
drop policy if exists tenant_role_permissions_insert on public.role_permissions;
drop policy if exists tenant_role_permissions_update on public.role_permissions;
drop policy if exists tenant_role_permissions_delete on public.role_permissions;
create policy tenant_role_permissions_select on public.role_permissions
  for select to authenticated
  using (company_id = (select private.current_company_id()));
create policy tenant_role_permissions_insert on public.role_permissions
  for insert to authenticated
  with check (company_id = (select private.current_company_id())
    and (select private.current_user_role()) in ('admin','gerente'));
create policy tenant_role_permissions_update on public.role_permissions
  for update to authenticated
  using (company_id = (select private.current_company_id())
    and (select private.current_user_role()) in ('admin','gerente'))
  with check (company_id = (select private.current_company_id())
    and (select private.current_user_role()) in ('admin','gerente'));
create policy tenant_role_permissions_delete on public.role_permissions
  for delete to authenticated
  using (company_id = (select private.current_company_id())
    and (select private.current_user_role()) in ('admin','gerente'));

do $$
declare
  child_table text;
  parent_table text;
  parent_key text;
  predicate text;
begin
  for child_table, parent_table, parent_key in
    select * from (values
      ('quote_items','quotes','quote_id'),
      ('order_items','orders','order_id'),
      ('cash_register_transactions','cash_register_sessions','session_id')
    ) as relations(child_table,parent_table,parent_key)
  loop
    execute format('alter table public.%I enable row level security', child_table);
    execute format('drop policy if exists %I on public.%I', 'tenant_'||child_table||'_select', child_table);
    execute format('drop policy if exists %I on public.%I', 'tenant_'||child_table||'_insert', child_table);
    execute format('drop policy if exists %I on public.%I', 'tenant_'||child_table||'_update', child_table);
    execute format('drop policy if exists %I on public.%I', 'tenant_'||child_table||'_delete', child_table);
    predicate := format('exists (select 1 from public.%I as parent where parent.id = %I.%I and parent.company_id = (select private.current_company_id()))', parent_table, child_table, parent_key);
    execute format('create policy %I on public.%I for select to authenticated using (%s)', 'tenant_'||child_table||'_select', child_table, predicate);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', 'tenant_'||child_table||'_insert', child_table, predicate);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', 'tenant_'||child_table||'_update', child_table, predicate, predicate);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', 'tenant_'||child_table||'_delete', child_table, predicate);
  end loop;
end;
$$;

drop policy if exists store_orders_self_select on public.orders;
create policy store_orders_self_select on public.orders for select to authenticated
using (exists (select 1 from public.store_customer_accounts as a
  where a.customer_id = orders.customer_id and a.company_id = orders.company_id
    and a.auth_user_id = (select auth.uid()) and a.status = 'active'));

drop policy if exists store_order_items_self_select on public.order_items;
create policy store_order_items_self_select on public.order_items for select to authenticated
using (exists (select 1 from public.orders as o
  join public.store_customer_accounts as a
    on a.customer_id = o.customer_id and a.company_id = o.company_id
  where o.id = order_items.order_id and a.auth_user_id = (select auth.uid())
    and a.status = 'active'));

drop policy if exists store_quotes_self_select on public.quotes;
create policy store_quotes_self_select on public.quotes for select to authenticated
using (exists (select 1 from public.store_customer_accounts as a
  where a.customer_id = quotes.customer_id and a.company_id = quotes.company_id
    and a.auth_user_id = (select auth.uid()) and a.status = 'active'));

drop policy if exists store_quote_items_self_select on public.quote_items;
create policy store_quote_items_self_select on public.quote_items for select to authenticated
using (exists (select 1 from public.quotes as q
  join public.store_customer_accounts as a
    on a.customer_id = q.customer_id and a.company_id = q.company_id
  where q.id = quote_items.quote_id and a.auth_user_id = (select auth.uid())
    and a.status = 'active'));

select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity,
  p.polname, p.polcmd, p.polroles,
  pg_get_expr(p.polqual,p.polrelid) as using_expression,
  pg_get_expr(p.polwithcheck,p.polrelid) as with_check_expression
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
left join pg_policy as p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname in (
  'cash_register_sessions','cash_register_transactions','categories','companies',
  'customers','financial_transactions','order_items','orders','pickup_points',
  'production_queue','products','quote_items','quotes','role_permissions','settings',
  'shipments','stock_movements','store_banners','suppliers')
order by c.relname,p.polname;
