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
INSERT direto do papel autenticado. O snapshot remoto contém 7 produtos, todos com
`active=true` e `catalog_active=true`, na mesma empresa. Portanto o total e o
payload público atual são 7; a referência anterior de 6 era histórica e não deve
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
  11, produtos totais 7, produtos ativos/publicados 7, categorias públicas atuais 8
  e clientes 25.
- Registrar que toda simulação terminou em `ROLLBACK` e repetir a leitura em nova sessão.
- Somente liberar com cinco simulações verdes e `ROLLBACK` explícito em todas.

## Hardening residual de tabelas públicas

### Escopo e evidência

A auditoria residual cobre dez tabelas que não pertenciam ao conjunto empresarial
das migrations 2/3. O estado anterior efetivo herdado do projeto antigo concedia
`SELECT`, `INSERT`, `UPDATE` e `DELETE` a `anon` e `authenticated` nas dez tabelas.
RLS estava ativa em todas e reduzia as linhas acessíveis, mas grants e RLS são
barreiras independentes. A migration
`20260714183326_minimize_residual_public_grants.sql` remove o CRUD herdado e
reexpõe nominalmente apenas as operações comprovadas. Ela não altera policies,
dados, owners, defaults ou privilégios de `service_role`.

O mapeamento está alinhado à mudança de plataforma publicada pela Supabase em
28/04/2026: tabelas expostas pela Data API devem ter grants explícitos e RLS;
nenhum grant pode ser inferido apenas pela existência de uma policy.

| Tabela | Consumidor/papel | Grant final proposto | Policy efetiva | Dados sensíveis e smoke |
| --- | --- | --- | --- | --- |
| `company_footer_badge_defaults` | Nenhum consumidor direto localizado; eventual leitura deve ser server-side | `anon`: nenhum; `authenticated`: nenhum | Sem policy de cliente | URLs/identificadores internos; confirmar bloqueio anon/auth e operação server-side preservada |
| `cookie_preferences` | `StorePrivacyContext`, navegador público ou autenticado | `anon`: `INSERT`; `authenticated`: `INSERT` | `cookie_preferences_public_insert`, `cookie_preferences_auth_insert` | identificador anônimo, `auth_user_id`, `customer_id`, preferências; validar INSERT revertido e ausência de leitura pública |
| `customer_addresses` | `StoreCustomerContext`, navegador autenticado | `authenticated`: `SELECT, INSERT, UPDATE, DELETE`; `anon`: nenhum | `store_addresses_self_all` | endereço completo, destinatário e referências; validar somente endereços da própria conta |
| `customer_consents` | `StorePrivacyContext` (INSERT) e área de privacidade (SELECT), autenticados | `authenticated`: `SELECT, INSERT`; `anon`: nenhum | `customer_consents_self_select`, `customer_consents_self_insert` | consentimentos, titular e identificadores; validar próprio titular e negar listagem pública |
| `data_subject_requests` | rota `/api/store/privacy-request` com chave pública (INSERT) e área autenticada (SELECT/INSERT) | `anon`: `INSERT`; `authenticated`: `SELECT, INSERT` | `data_subject_requests_public_insert`, `data_subject_requests_self_insert`, `data_subject_requests_self_select` | e-mail, identificação, detalhes e resposta LGPD; validar INSERT revertido, leitura própria e nenhuma leitura anon |
| `privacy_audit_events` | Contrato autenticado previsto pela policy; nenhum leitor direto no frontend | `authenticated`: `INSERT`; `anon`: nenhum | `privacy_audit_events_auth_insert` | JSON de auditoria e identificadores; validar INSERT próprio e negar SELECT de cliente |
| `privacy_policy_versions` | Data API pública prevista para versão publicada; páginas atuais também possuem conteúdo estático | `anon`: `SELECT`; `authenticated`: `SELECT` | `privacy_policy_public_active_select` | conteúdo/versionamento, sem PII; validar somente `is_active=true` e `published_at` não nulo |
| `profiles` | `AuthContext` (SELECT/claim UPDATE); o frontend também tenta CRUD administrativo, mas o banco remoto não possui policies para INSERT/DELETE | `authenticated`: `SELECT, UPDATE`; `anon`: nenhum | `tenant_profiles_select`, `tenant_profiles_claim_auth_user` | e-mail, telefone, `auth_user_id`, `company_id`, papel; validar perfil próprio/claim e bloqueio anon/cross-tenant |
| `store_customer_accounts` | `StoreCustomerContext` (SELECT); criação pela RPC autenticada `ensure_store_customer_account` | `authenticated`: `SELECT`; `anon`: nenhum | `store_accounts_self_select` | `auth_user_id`, cliente, empresa e status; validar conta própria; sem INSERT direto |
| `store_customer_favorites` | `StoreCustomerContext`, navegador autenticado | `authenticated`: `SELECT, INSERT, DELETE`; `anon`: nenhum | `store_favorites_self_select`, `store_favorites_self_insert`, `store_favorites_self_delete` | IDs internos de cliente/produto/empresa; validar favoritos próprios e produto público ativo |

As únicas operações anônimas intencionais são `INSERT` em
`cookie_preferences`, `INSERT` em `data_subject_requests` e `SELECT` em
`privacy_policy_versions`. Nenhum `SELECT` anônimo alcança e-mail, telefone,
endereço, documento, `auth_user_id`, `company_id`, papel, consentimento, detalhes
LGPD ou JSON de auditoria. `company_footer_badge_defaults`, `customer_addresses`,
`customer_consents`, `privacy_audit_events`, `profiles`,
`store_customer_accounts` e `store_customer_favorites` ficam sem qualquer grant
para `anon`.

`profiles` recebe somente `SELECT, UPDATE`, que é o contrato coberto pelas duas
policies encontradas no banco remoto. Embora o frontend contenha tentativas de
INSERT/DELETE e atualização administrativa, essas operações já são bloqueadas pela
ausência de policies remotas e não devem ser abertas incidentalmente por uma
migration de grants. O fluxo administrativo deve ser movido para RPC/rota
server-side com autorização de admin/gerente e DTO de colunas permitidas antes de
qualquer grant futuro. Isso também é necessário para impedir que atualização
pessoal alcance `company_id`, `role`, `active` ou outros campos administrativos.

### Aplicação, smoke e recovery

1. Pré-condições: migrations 1–5 validadas; RLS ativa nas dez tabelas; snapshot e
   contagens preservados; hash da migration registrado.
2. Aplicar somente
   `supabase/migrations/20260714183326_minimize_residual_public_grants.sql` em
   janela própria e com `ON_ERROR_STOP`.
3. Validar ACLs por `has_table_privilege`, policies em `pg_policies` e ausência de
   ACL de `PUBLIC` via `aclexplode`.
4. Smoke público: catálogo, cookies, política publicada e schema do formulário
   LGPD; escritas somente em transação com `ROLLBACK`, sem solicitação real.
5. Smoke autenticado: login da loja, conta, endereços, consentimentos, pedidos,
   orçamentos, favoritos e perfil; depois admin, CRM, financeiro, produção,
   manifests e PWA. Confirmar negação cross-tenant.
6. Diante de erro, não restaurar o CRUD antigo. Executar nominalmente
   `docs/security/rollback/20260714183326_minimize_residual_public_grants_recovery.sql`
   em transação controlada. Esse recovery reasserta o mesmo mínimo seguro e nunca
   desabilita RLS, concede a `PUBLIC` ou usa `GRANT ALL`.
7. Repetir ACL/policy/smoke e registrar operador, UTC, America/Bahia e evidências.

### Simulação aprovada em 14/07/2026

- Runner externo:
  `C:\Backups\PrintFlowPRO\pre-rls-20260714\simulation\run-residual-grants-simulation.ps1`.
- Auditoria de metadados: `PSQL_EXIT_CODE=0`, modo somente leitura, sem conteúdo
  de registros; RLS ativa em 10/10 tabelas, owner `postgres`, FORCE RLS desativado
  e 16 policies capturadas.
- Simulação: migration residual, matriz de grants, testes `anon`, testes
  `authenticated`, recovery seguro e pós-validação executados dentro do mesmo
  `BEGIN`.
- Resultado: `BEFORE_EXIT_CODE=0`, `SIMULATION_EXIT_CODE=0`,
  `AFTER_EXIT_CODE=0` e `ROLLBACK_EXPLICIT=True`.
- Fingerprint ACL/RLS/policies antes/depois:
  `06dae7cacb87382a6142b25f8231c7a2`, sem divergência.
- Janela UTC: `2026-07-14T18:40:16.8671679Z` a
  `2026-07-14T18:40:27.8091285Z` (America/Bahia: 15:40:16 a 15:40:27).
- Estado remoto: inalterado; migration e recovery não aplicados
  permanentemente; nenhum dado de teste persistiu.
- Evidências: `residual-grants-audit.*`, `residual-grants-simulation.*` e
  `residual-acl-{before,after}.out.txt` no diretório externo de simulação.

### Rate limiting pendente

- `cookie_preferences`: limitar por IP/tenant e janela curta; limitar tamanho do
  identificador e payload; sanitizar `source`; não registrar o conteúdo completo.
- `data_subject_requests`: manter limite por IP já existente na rota, mover o
  contador em memória para armazenamento distribuído antes de escalar, considerar
  CAPTCHA após limiar, impor tamanho máximo e registrar apenas metadados sem PII.
- Qualquer consentimento público futuro: não abrir grant antes de rota dedicada,
  CAPTCHA/limite temporal, validação de versão e testes de abuso. A implementação
  atual de `customer_consents` permanece exclusivamente autenticada.

### Risco residual de `supabase_admin`

`postgres` não é membro de `supabase_admin`. Os default privileges de
`supabase_admin` continuam pendentes e nenhuma elevação será tentada nesta etapa.
Cada nova migration deve auditar owner e grants após criar objetos; objetos cujo
owner seja `supabase_admin` exigem revisão pós-criação pelo administrador da
plataforma. A migration residual não altera esses defaults.

## Reconciliação do histórico

Não executar enquanto a migration residual não tiver sido aplicada e validada em
uma janela posterior. A ajuda da Supabase CLI 2.109.1 confirma a sintaxe:

```text
supabase migration repair [flags] <version...>
--status choice   (applied ou reverted)
--linked          projeto vinculado
--db-url string   conexão explícita, percent-encoded
```

Plano para o projeto vinculado, sem inserir diretamente em
`supabase_migrations.schema_migrations`:

1. Confirmar branch/commit aprovado, backup, hashes dos seis arquivos e estado
   remoto equivalente ao SQL de cada migration.
2. Executar `npx supabase@2.109.1 migration list --linked` e salvar a evidência.
3. Somente após aprovação, marcar as cinco versões já aplicadas manualmente:

   ```powershell
   npx supabase@2.109.1 migration repair --linked --status applied 20260712170000 20260712171000 20260712172000 20260712173000 20260712174000
   ```

4. Aplicar e validar a migration residual em etapa separada. Só então marcar
   `20260714183326` como aplicada com:

   ```powershell
   npx supabase@2.109.1 migration repair --linked --status applied 20260714183326
   ```

5. Repetir `npx supabase@2.109.1 migration list --linked`; as versões local/remota
   devem coincidir e o schema deve continuar igual às capturas.

É proibido executar `supabase db push` enquanto houver divergência, usar INSERT
manual na tabela de histórico ou marcar a migration residual antes da aplicação
real e do smoke aprovado. Nenhum comando `migration repair` foi executado nesta
preparação.
