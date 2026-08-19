# Fase 4B — Auditoria global de integridade de persistência

Data da auditoria: 2026-08-19
Base auditada: `6d3fa5d5c51245153c3658b11073485bf4c611b8`
Branch: `feat/global-persistence-integrity`

## Conclusão arquitetural

O banco permanece a única fonte de verdade para dados empresariais. Foram removidos 13 efeitos reativos que convertiam hidratação ou alteração de estado React em `upsert` de coleções completas. Escritas normais agora partem de comandos explícitos e mínimos; agregados que legitimamente precisam salvar itens em lote usam RPC transacional com CAS; fluxos que alteram várias tabelas usam RPC server-side com tenant, autorização, lock e Audit Log no mesmo commit.

O Realtime da Produção continua unidirecional (`banco → UI`). Nenhum handler de Realtime inicia persistência.

## Inventário consolidado

| Módulo | Dado | Fonte canônica | Padrão antigo | Classificação inicial | Correção | Audit Log | Concorrência | Status final |
|---|---|---|---|---|---|---|---|---|
| Dashboard | métricas derivadas | tabelas operacionais | leitura/derivação | `OK_UI_STATE` | nenhuma | não aplicável | não aplicável | OK |
| Clientes | cadastro/contato/crédito | `customers` | CRUD explícito, mas update de objeto completo e sem CAS | `CONCURRENCY_GAP` / `AUDIT_GAP` | patch por campos alterados, tenant filter, CAS e rollback/refetch | `customer.created/updated/deleted`, sem documento, contato, endereço ou observações | `updated_at` | RESOLVED |
| Fornecedores | cadastro | `suppliers` | estado local dependia do upsert da coleção | `HIGH_BULK_SNAPSHOT` | insert explícito; efeito removido | não ampliado nesta fase | criação não exige CAS | RESOLVED |
| Categorias | cadastro, hierarquia, apresentação | `categories` | CRUD explícito coexistia com upsert integral | `HIGH_BULK_SNAPSHOT` / `DUPLICATE_SOURCE` | insert/patch/delete explícitos e mínimos; CAS | `category.*` | `updated_at` | RESOLVED |
| Produtos | cadastro, preço, catálogo | `products` | update de objeto amplo + upsert integral da lista | `HIGH_BULK_SNAPSHOT` / `DUPLICATE_SOURCE` | patch somente dos campos editáveis alterados; estoque excluído do editor; CAS | `product.*`; imagens grandes omitidas | `updated_at` | RESOLVED |
| Precificação | cálculo | `pricing.ts` + snapshots comerciais persistidos | cálculo/estado derivado | `OK_UI_STATE` | nenhuma; engine intacta | não aplicável | não aplicável | OK |
| Orçamentos | cabeçalho + itens | `quotes`/`quote_items` | aggregate save transacional, mas stale podia substituir itens | `CONCURRENCY_GAP` | wrapper server-side com lock/CAS; lote de itens mantido como ação explícita | `quote.created/updated` | `updated_at`; conflito recarrega cabeçalho e itens | RESOLVED |
| Pedidos | cabeçalho + itens/status | `orders`/`order_items` | aggregate save sem CAS; status e expedição em requisições separadas | `CONCURRENCY_GAP` / `AUDIT_GAP` | wrapper CAS para aggregate save e RPC de status que cria/entrega expedição de forma idempotente | `order.created/updated/status_changed` | lock + `updated_at` | RESOLVED |
| Produção | fase operacional | `production_queue.status` | já corrigido na Fase 4A | `OK_BULK_EXPLICIT` | preservado | `production.stage_changed` | CAS/row lock | OK |
| Financeiro | lançamentos/baixa/pagamento | `financial_transactions` + saldo do pedido | coleção inteira e efeitos independentes para pedido/cliente/caixa | `HIGH_BULK_SNAPSHOT` / `DUPLICATE_SOURCE` / `CONCURRENCY_GAP` | insert explícito; baixa, reversão de baixa e pagamento atômicos server-side, incluindo saldo do pedido e crédito faturado | `financial.transaction_created/payment_changed/deleted` | lock + CAS | RESOLVED |
| PDV / Caixa | sessão, movimentos, recebimentos | `cash_register_sessions`/`cash_register_transactions` | três coleções locais persistidas separadamente | `HIGH_BULK_SNAPSHOT` / `DUPLICATE_SOURCE` | RPC única para abrir, fechar, suprir e sangrar; índice parcial de sessão aberta | `cash_register.*`; financeiro relacionado é auditado no ledger | lock + CAS + unique parcial | RESOLVED |
| Estoque | saldo e movimento | `products.current_stock` + `stock_movements` | saldo absoluto e movimento dependiam de dois efeitos | `HIGH_BULK_SNAPSHOT` / `DUPLICATE_SOURCE` | `adjust_inventory_stock`: delta validado, lock, saldo e movimento atômicos | `inventory.adjusted` exatamente no movimento | lock + CAS | RESOLVED |
| Expedição | status/rastreio/entrega | `shipments` | mudança só local; recriação por status de pedido | `HIGH_BULK_SNAPSHOT` / `DUPLICATE_SOURCE` | RPC de transição; pedido entregue na mesma transação; shipment único por empresa/pedido | `shipment.created/status_changed/deleted` | lock + CAS + unique | RESOLVED |
| Configurações | settings empresariais | `settings` | upsert do snapshot inteiro a cada mudança | `HIGH_BULK_SNAPSHOT` | patch somente dos campos submetidos e alterados | `catalog.configuration_changed`; `pix_key` omitida | `updated_at` | RESOLVED |
| Empresa | identidade/domínios/benefícios | `companies` | snapshot amplo automático | `HIGH_BULK_SNAPSHOT` | diff mínimo no comando Salvar; RLS admin/gerente preservada | `company.configuration_changed` com allowlist | `updated_at` | RESOLVED |
| Pontos de coleta | endereços/horários | `pickup_points` | coleção completa por efeito | `HIGH_BULK_SNAPSHOT` | insert/patch/delete explícitos e CAS | `pickup_point.*` com payload reduzido | `updated_at` | RESOLVED |
| Catálogo / banners | merchandising | `store_banners` | coleção completa por efeito | `HIGH_BULK_SNAPSHOT` / `SCHEMA_GAP` | comandos por banner; `updated_at` aditivo | `catalog.banner_*`, sem URLs de imagem | `updated_at` | RESOLVED |
| Usuários/permissões | matriz por rota | `role_permissions` | coleção completa por efeito | `HIGH_BULK_SNAPSHOT` | bulk explícito único, server-side, somente paths enviados, versões conferidas, updates idempotentes | `user.permission_*` por path alterado | version map por path | RESOLVED |
| WhatsApp | templates/settings/customizações | tabelas WhatsApp | upsert de registro único iniciado por Salvar | `OK_BULK_EXPLICIT` | nenhuma; Fases anteriores preservadas | cobertura própria existente | RLS/serviços existentes | OK |
| Store | carrinho, tema, consentimento, cadastro | banco + cache local intencional | `localStorage` para carrinho/tema/consentimento/cache de cadastro | `OK_CACHE` / `OK_UI_STATE` | nenhuma; não são autoridade de preço, pedido ou configuração empresarial | não aplicável | refetch no checkout | OK |
| Revenda | telas/estado existente | fontes operacionais atuais | nenhum snapshot bulk confirmado | `REVIEW` | nenhuma alteração sem achado real | não ampliado | dívida baixa documentada | OK |

## Contagens e decisões

- Efeitos bulk snapshot perigosos confirmados e removidos: **13** (`suppliers`, `categories`, `products`, `financial_transactions`, `shipments`, `stock_movements`, `settings`, `pickup_points`, `companies`, `store_banners`, `role_permissions`, `cash_register_sessions`, `cash_register_transactions`).
- Fontes duplicadas relevantes eliminadas: **8 fluxos lógicos** (catálogo mestre, financeiro/pagamento, estoque, expedição, configurações, merchandising/permissões, caixa/PDV e aggregates orçamento/pedido sem concorrência).
- Bulk legítimos preservados: aggregate save de orçamento, aggregate save de pedido, matriz explícita de permissões, criação idempotente da fila de produção, leituras paralelas e a ação administrativa destrutiva “Limpar Todos os Dados”.
- A limpeza total permanece `OK_BULK_EXPLICIT`: botão em Área de Perigo, confirmação humana e RLS tenant. Ela não foi executada nesta fase e não é usada por hidratação, Realtime ou fluxo normal.
- Upserts WhatsApp restantes são de uma única configuração/template e partem de comandos explícitos, não de snapshots de coleção.

## Migration e comandos server-side

Migration aditiva: `20260819130847_phase4b_global_persistence_integrity.sql`.

Comandos novos:

- `adjust_inventory_stock`
- `transition_shipment`
- `settle_financial_transaction`
- `operate_cash_register`
- `save_role_permissions`
- `transition_order_status_phase4b`
- `record_order_payment_phase4b`
- `save_order_with_items_phase4b`
- `save_quote_with_items_phase4b`

Todos derivam tenant de `private.current_company_id()`, validam `auth.uid()`, perfil ativo e permissão da rota, usam `SECURITY DEFINER` com `search_path = ''`, revogam `PUBLIC`/`anon` e concedem apenas a `authenticated`. Os aggregates antigos de orçamento/pedido tiveram `EXECUTE` revogado para o browser, impedindo bypass do CAS.

## Audit Log

O trigger privado grava no ponto autoritativo e na mesma transação. Os payloads são reduzidos por tabela. Não entram no log: `pix_key`, documento, telefone, e-mail, endereço, observações de cliente, imagens, senha, token, credencial ou service role. Atualização exclusiva de `products.current_stock` não duplica o evento de `stock_movements`; o evento canônico é `inventory.adjusted`.

## LocalStorage, demo e caches

- Tema administrativo/Store, carrinho, consentimento de privacidade, sinalizadores visuais e cache transitório de cadastro: `OK_UI_STATE`/`OK_CACHE`.
- `persistDemoSnapshot`: `OK_CACHE`, protegido por opt-in de demo e fora da autoridade Production.
- Quotes/orders ainda podem espelhar o estado no armazenamento **somente no modo demo explicitamente habilitado**; em tenant autenticado toda persistência empresarial passa pelo Supabase.
- Dummy data de testes e fallback de desenvolvimento permanece isolada; nenhuma fixture tornou-se fonte de Production.

## Riscos residuais não bloqueadores

1. A ação “Limpar Todos os Dados” é um bulk destrutivo legítimo e antigo. Continua fora dos fluxos normais, exige confirmação e não foi acionada; uma fase futura pode movê-la para RPC única com confirmação digitada e relatório de exclusão.
2. Fornecedores possuem somente criação na API de contexto atual; edição/arquivamento futuro deverá seguir o helper de patch/CAS já criado.
3. Não foi reconstruído ledger histórico; a lacuna histórica conhecida permanece deliberadamente fora do escopo.
4. Avisos ESLint preexistentes de `<img>` são dívida visual/performance, não integridade de persistência.

## Evidência local

- Replay integral das migrations: PASS.
- pgTAP: 7 arquivos / 212 assertions PASS.
- Testes comportamentais Phase 4B: stale write, duas identidades, tenant isolation, autorização negativa, estoque, caixa, expedição, financeiro, pagamento e Audit Log.
- Testes Node específicos Phase 4B: 9/9 PASS.
- TypeScript: PASS.
- ESLint: 0 erros; warnings preexistentes documentados.

O status Preview, aplicação target-only, revisão, merge e smoke Production será registrado após os gates remotos da mesma macroetapa.
