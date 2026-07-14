# Multitenant RLS rollout

Este runbook é um gate operacional. Cada etapa exige horário inicial/final em UTC
e America/Bahia, operador responsável, evidências antes/depois e decisão explícita
de continuar. Senha, host completo, URI e chaves nunca entram neste arquivo.

## Backup pré-rollout

- Backup Supabase confirmado: 14/07/2026 07:35:41 UTC (04:35:41 America/Bahia), disponível para restauração.
- Snapshot externo: `C:\Backups\PrintFlowPRO\pre-rls-20260714`.
- Dump: `schema-before-rls.sql`, 112.523 bytes.
- SHA-256: `75FDB83EAFEA2B48D600B0267234A62ACC678675D74BC00BF2CB7F24B1F79BDE`.
- Schemas: `public` e `private`; funções, grants, RLS/policies e default privileges capturados.
- Cliente: `pg_dump`/`psql` 17.10; conexão Session Pooler na porta 5432.
- Credenciais persistidas: nenhuma; `PGPASSWORD` removida após cada uso.

## Matriz de acesso esperada

| Classe | Objetos | Anônimo | Autenticado |
| --- | --- | --- | --- |
| Tenant privado | clientes, fornecedores, comercial, produção, financeiro, estoque, expedição e caixa | nenhum | própria empresa |
| Base do catálogo | empresas, configurações, categorias, produtos, retiradas e banners | nenhum acesso direto | própria empresa |
| Cliente da loja | conta, endereços, favoritos, pedidos e orçamentos próprios | policies estreitas existentes | própria conta |
| Técnico | profiles e permissões | nenhum | contexto atual |

O catálogo público usa rota de servidor, tenant por host e DTO explícito. Falha da
rota nunca justifica grant direto ao papel anônimo.

## Controles comuns

1. Deploy das rotas servidoras e segredo apenas no runtime antes do banco.
2. Aplicar migrations estritamente na ordem dos timestamps.
3. Usar uma sessão dedicada; não misturar rollout e smoke em conexões reutilizadas.
4. Parar diante de erro SQL, policy aberta, acesso cruzado, grant inesperado ou contagem alterada.
5. Recovery mantém RLS e menor privilégio; restauração completa usa o backup, por decisão de incidente.
6. Responsável padrão: DBA/engenheiro de segurança; aprovador: responsável técnico do produto.
7. Registro obrigatório: operador, aprovador, início/fim, resultado, hash da migration e evidências.

## Falha anterior e correção da migration 3

A primeira simulação falhou porque `public.companies` estava no bloco genérico
baseado em `company_id`; a tabela usa `id`. Antes de qualquer aplicação, a migration
3 foi corrigida nesta branch: `companies` passou a ter policies explícitas por `id`,
`role_permissions` recebeu regra administrativa própria e somente tabelas auditadas
com `company_id` permaneceram no bloco direto. O runner deve usar
`ON_ERROR_STOP`, alcançar `ROLLBACK` explicitamente e abrir uma nova sessão de
leitura depois de cada teste.

## Matriz real das 19 tabelas

| Classe | Tabelas | Regra |
| --- | --- | --- |
| `company_id` direto | cash_register_sessions, categories, customers, financial_transactions, orders, pickup_points, production_queue, products, quotes, settings, shipments, stock_movements, store_banners, suppliers | quatro policies tenant |
| Tenant pelo próprio `id` | companies | SELECT da própria empresa; UPDATE somente admin/gerente; sem INSERT/DELETE direto |
| Filhas por FK | cash_register_transactions→cash_register_sessions, order_items→orders, quote_items→quotes | `EXISTS` no pai e empresa do pai |
| Especial administrativa | role_permissions | SELECT da empresa; mutações somente admin/gerente |

O onboarding cria empresas por trigger/RPC `SECURITY DEFINER`; não depende de
INSERT direto do papel autenticado. O snapshot remoto contém 6 produtos, todos com
`active=true` e `catalog_active=true`, na mesma empresa. Portanto o total e o
payload público atual são 6; a referência anterior de 5 era histórica e não deve
ser reconciliada por alteração ou exclusão de dados.

## 1 — Harden multitenant helpers

1. **Objetivo:** fixar owner/contexto e `search_path` dos helpers privados.
2. **Pré-condições:** backup validado; `profiles` e `auth.uid()` disponíveis.
3. **Objetos:** `private.current_company_id()` e `private.current_user_role()`.
4. **Antes:** consultar `pg_proc` (`proowner`, `prosecdef`, `proconfig`, `proacl`).
5. **Aplicação:** arquivo `supabase/migrations/20260712170000_harden_multitenant_helpers.sql` sem edição.
6. **Depois:** owner `postgres`, SECURITY DEFINER, `search_path=pg_catalog`, execução apenas autenticada.
7. **Smoke:** usuário ativo resolve empresa/papel; sem JWT retorna NULL.
8. **Falhas:** NULL para usuário ativo, função não resolvida ou permission denied na policy.
9. **Parada:** owner/search_path/ACL divergente ou tenant incorreto.
10. **Recovery:** `docs/security/rollback/20260712170000_harden_multitenant_helpers_recovery.sql`.
11. **Execução:** rodar o recovery inteiro como owner em transação controlada.
12. **Pós-recovery:** repetir catálogo e smoke; confirmar ausência de execução pública/anônima.
13. **Proibido:** definição antiga insegura, tabela não qualificada, ampliar EXECUTE.
14. **Responsável:** DBA/segurança.
15. **Horário:** registrar início/fim UTC e America/Bahia.
16. **Estado esperado:** helpers seguros; grants/RLS de tabelas inalterados.

## 2 — Revoke unsafe public grants

1. **Objetivo:** retirar acesso direto anônimo e explicitar operações autenticadas.
2. **Pré-condições:** rotas públicas servidoras implantadas; migration 1 validada.
3. **Objetos:** 19 tabelas empresariais e `public.quotes_number_seq`.
4. **Antes:** `role_table_grants`, `role_usage_grants` e ACLs do snapshot.
5. **Aplicação:** `supabase/migrations/20260712171000_revoke_unsafe_public_grants.sql`.
6. **Depois:** nenhum grant anônimo; authenticated conforme operação; service_role funcional.
7. **Smoke:** dashboard, CRM, catálogo, orçamento, pedido, caixa, financeiro e configurações.
8. **Falhas:** `permission denied` somente numa operação legítima autenticada.
9. **Parada:** qualquer grant anônimo/público ou privilégio global.
10. **Recovery:** `docs/security/rollback/20260712171000_revoke_unsafe_public_grants_recovery.sql`.
11. **Execução:** aplicar somente após identificar tabela/operação/rota afetada.
12. **Pós-recovery:** repetir grants e a rota específica; testar negação anônima.
13. **Proibido:** privilégio global, defaults amplos ou bypass da rota servidora.
14. **Responsável:** DBA + dono da rota.
15. **Horário:** registrar início/fim e grant nominal restaurado.
16. **Estado esperado:** menor privilégio + RLS ainda no estado da etapa anterior.

## 3 — Enable multitenant RLS

1. **Objetivo:** isolar 19 tabelas por empresa, inclusive filhos por registro pai.
2. **Pré-condições:** migrations 1/2 aprovadas, matriz de colunas/FKs auditada e migration corrigida ainda não aplicada.
3. **Objetos:** as 19 tabelas listadas no recovery; quatro policies por tabela, exceto `companies` sem INSERT/DELETE, mais quatro SELECTs da loja.
4. **Antes:** `relrowsecurity`, `relforcerowsecurity`, `pg_policy` e duas identidades de empresas distintas.
5. **Aplicação:** `supabase/migrations/20260712172000_enable_multitenant_rls.sql` corrigida nesta branch.
6. **Depois:** RLS ativa; policies autenticadas com `USING`/`WITH CHECK`; filhos validados pelo pai.
7. **Smoke:** SELECT/INSERT/UPDATE/DELETE tenant A; negação tenant B; troca de `company_id`; cliente da loja próprio.
8. **Falhas:** erro de coluna, recursão, 403 legítimo, zero linhas inesperado ou vazamento.
9. **Parada:** qualquer erro de coluna em `companies` ou outra tabela auditada.
10. **Recovery:** `docs/security/rollback/20260712172000_enable_multitenant_rls_recovery.sql`.
11. **Execução:** substituir somente policies defeituosas; nunca desligar RLS.
12. **Pós-recovery:** `relrowsecurity=true`, papéis/expressões auditados e smoke cruzado.
13. **Proibido:** policy aberta, acesso emergencial genérico, remover `WITH CHECK`.
14. **Responsável:** DBA/segurança com aprovador do produto.
15. **Horário:** registrar cada tabela afetada e duração.
16. **Estado esperado:** isolamento por `company_id`; filhos pelo pai; anônimo bloqueado.

## 4 — Restrict RPC execution

1. **Objetivo:** tornar funções privadas por padrão e expor só RPCs necessárias.
2. **Pré-condições:** migrations 1–3 e smoke de RLS aprovados.
3. **Objetos:** RPCs/assinaturas nominais do recovery, incluindo provisionamento.
4. **Antes:** `pg_proc`, owner, `prosecdef`, `proconfig`, `proacl` e chamadas `.rpc()` do app.
5. **Aplicação:** `supabase/migrations/20260712173000_restrict_rpc_execution.sql`.
6. **Depois:** execução autenticada mínima; nenhuma execução pública/anônima.
7. **Smoke:** provisionamento, cadastro da loja, salvar orçamento/pedido e aprovar orçamento.
8. **Falhas:** permission denied ou assinatura não resolvida.
9. **Parada:** RPC pública, helper privado exposto ou alteração de corpo/search_path.
10. **Recovery:** `docs/security/rollback/20260712173000_restrict_rpc_execution_recovery.sql`.
11. **Execução:** regrant nominal somente após confirmar chamada legítima.
12. **Pós-recovery:** auditar ACLs e repetir somente o fluxo afetado.
13. **Proibido:** grant global, overload ambíguo ou acesso anônimo.
14. **Responsável:** DBA + responsável pelo fluxo.
15. **Horário:** registrar RPC, assinatura e smoke.
16. **Estado esperado:** authenticated mínimo; demais funções privadas.

## 5 — Harden default privileges

1. **Objetivo:** impedir exposição automática de objetos futuros.
2. **Pré-condições:** migrations 1–4 aprovadas; owner executor confirmado.
3. **Objetos:** default ACLs globais e de `postgres` em `public`; `supabase_admin` apenas auditado. O nível global é necessário porque um `REVOKE` limitado ao schema não neutraliza grants globais.
4. **Antes:** `pg_default_acl` por owner/schema/tipo.
5. **Aplicação:** `supabase/migrations/20260712174000_harden_default_privileges.sql`.
6. **Depois:** nenhum CRUD/EXECUTE automático para papéis de API.
7. **Smoke:** criar objeto apenas em simulação, auditar ACL e desfazer por ROLLBACK.
8. **Falhas:** permission denied para alterar defaults de outro owner ou ACL ampla persistente.
9. **Parada:** tentativa de elevação ou alteração de `supabase_admin` sem janela administrativa.
10. **Recovery:** `docs/security/rollback/20260712174000_harden_default_privileges_recovery.sql`.
11. **Execução:** reaplicar defaults seguros e conceder objeto por objeto em mudança futura.
12. **Pós-recovery:** repetir `pg_default_acl` e auditoria de objetos novos.
13. **Proibido:** restaurar defaults amplos ou execução pública automática.
14. **Responsável:** DBA; `supabase_admin` pelo administrador da plataforma.
15. **Horário:** registrar owner, tipo de objeto e resultado.
16. **Estado esperado:** defaults de `postgres` seguros; limitação administrativa documentada.

## Verificação final e decisão

- Confirmar ausência das cinco versões na tabela de histórico antes do rollout real.
- Confirmar estado remoto contra o snapshot e contagens: empresas 5, pedidos 13,
  itens de pedido 17, orçamentos 12, itens de orçamento 19, transações financeiras
  11, produtos totais 6, produtos ativos/publicados 6 e clientes 25.
- Registrar que toda simulação terminou em `ROLLBACK` e repetir a leitura em nova sessão.
- Somente liberar com cinco simulações verdes e `ROLLBACK` explícito em todas.
