# Fase 8 — auditoria e contrato financeiro

Base confirmada após fetch: `dcf24b11d2c7e09129790059634476b83558b6ee`. Branch solicitada `feat/phase8-finance-2`. Worktree/stage limpos e divergência 0/0 antes da criação; benchmark não rastreado preservado via stash temporário e restaurado sem alteração.

Catálogo remoto `dyqqhhywiubjraxyebgr` consultado em leitura. Última migration remota: `20261022000817_phase7_agenda`. Não existem contas bancárias, categorias financeiras relacionais ou configurações financeiras privadas.

| Capacidade | Classificação | Fonte atual / comando / lacuna |
|---|---|---|
| Lançamentos | EXISTS_PARTIAL | `financial_transactions`, único livro; categoria textual, tipo, status, vencimento, paid_at. Falta conta, origem, classificação e competência. |
| Recebíveis | EXISTS_PARTIAL | `orders`, `financial_transactions`, `finance-rules.ts`, `get_b2b_credit_exposure`; saldo derivado, sem nova tabela de recebíveis. |
| Pagamentos / parciais | EXISTS_COMPLETE | `record_order_payment_and_production` → `record_order_payment_phase4b`; preserva pedido, produção, cliente e caixa atomicamente. Nova interface deve chamar a autoridade existente. |
| B2B | EXISTS_PARTIAL | `customers` crédito/termos + pedidos e recebimentos; fallback PED/ORD e maior entre paid_amount e pagamentos. Retry sem versão merece proteção. |
| Reversões | LOGIC_GAP | `settle_financial_transaction` alterna estado e limpa paid_at. Novas baixas/reversões precisam preservar movimentos e negar bypass. |
| PDV / caixa | EXISTS_PARTIAL | `cash_register_sessions`, `cash_register_transactions`, `operate_cash_register`; controle operacional da sessão. Vendas também aparecem no livro: nunca somar os dois. Abertura/fechamento não são receitas. |
| Contas bancárias | SCHEMA_GAP | `settings.bank_name/pix_key` são instruções de pagamento, não contas. Criar contas tenant-scoped sem saldo corrente editável. |
| Fluxo de caixa | EXISTS_PARTIAL | Livro existente + agregação no cliente; passar leitura/indicadores ao servidor, separar transferência e capital de resultado operacional. |
| Contas a pagar | EXISTS_PARTIAL | Despesa pendente no próprio livro; estender com fornecedor, conta prevista, custo fixo e recorrência limitada. |
| Fornecedores | EXISTS_COMPLETE para seleção | Reutilizar `suppliers`; nenhum cadastro paralelo. |
| Categorias | SCHEMA_GAP | Texto livre existente; vínculo opcional a categoria tenant-scoped, preservando texto histórico. |
| Impostos / taxas | EXISTS_PARTIAL | `settings.tax_rate/commission_rate` e custos de pricing. Configuração gerencial privada para taxas/metas/regime; não simular apuração fiscal. |
| Equilíbrio | LOGIC_GAP | Custos fixos ainda não classificados. Margem somente com base confiável ou estimativa explicitamente configurada; zero/ausência não vira precisão fictícia. |
| Audit Log | EXISTS_COMPLETE | `audit_logs` append-only e trigger `private.phase4b_audit_business_mutation`; novos eventos entram na mesma transação. |
| Links de pagamento | FUTURE_ADVANCED | Nenhum provider novo nesta fase. |

## Invariantes de implementação

- `financial_transactions` continua sendo o único livro. Obrigações a pagar e suas liquidações devem ter papéis distintos no próprio livro, para que um título pago não seja somado novamente à saída de caixa.
- Transferência cria duas pontas na mesma transação, mesma operação, contas do mesmo tenant; consolidado neutro e fora de receita/despesa operacional.
- Saldo é derivado de movimentos. Abertura e ajuste são movimentos identificados e auditados. Histórico anterior sem conciliação bancária fica explicitamente identificado; não inventar banco de origem.
- Comandos críticos validam auth, tenant, `/financial`, referências, versão e chave de idempotência. Falha lança erro e reverte a operação inteira. Locks usam ordem consistente.
- Leituras de contas/configurações exigem Financeiro; leituras de recebimentos necessárias a Pedidos/PDV permanecem disponíveis sem expor saldos bancários.
- Recorrência é geração explícita de uma próxima ocorrência, com unicidade; não há criação infinita ou job implícito.
- Sem DRE novo, comissões, provider de cobrança ou cálculo fiscal oficial.

## Revisão independente inicial

Confirmou riscos de duplicar caixa/FT, bypass por escrita direta no livro, deduplicação heurística de pagamentos distintos, replay de faturamento sem versão e reversão sem compensação de caixa. Esses pontos fazem parte dos testes e da revisão final, não são considerados resolvidos apenas por este documento.

## Implementação e validação antes do Preview

- Oito áreas usam `/api/finance` e um snapshot autorizado via `finance_source`. A agregação ocorre no servidor; tabelas retornam páginas de 50 registros. Há limite explícito de 50 mil lançamentos/pedidos por empresa, sem truncamento silencioso.
- Novas baixas e reversões de contas a pagar preservam título, saída e compensação no mesmo livro. Movimentos de transferência, abertura e capital são classificados separadamente.
- Escrita direta no livro foi revogada. A RPC legada de liquidação conserva seu contrato, com a permissão configurada de `/financial` também no boundary. A implementação delegada não é executável pelo cliente.
- Caixa físico integrado não admite novos movimentos pelo Financeiro enquanto houver sessão PDV aberta; isso evita um segundo ajuste no fechamento. Depois do fechamento a movimentação é permitida. Nenhuma soma do espelho PDV com o livro financeiro.
- Recorrência é geração manual de uma próxima obrigação, protegida por unicidade. Margem é estimativa informada; metas são finitas. Imposto reutiliza `settings.tax_rate`; outras taxas são gerenciais, sem aplicação automática ao pricing.
- Configuração de permissões vazia nega também o administrador, conforme a regra da interface. RLS dos dados bancários/configurações permanece exclusiva do Financeiro; Pedidos/PDV leem apenas seus recebimentos.
- Revisão independente estática: BLOCKER 0 / HIGH 0 / MEDIUM 0 após corrigir bypass legado, caixa físico, B2B histórico, filtros do fluxo e metas não finitas.
- pgTAP focado: 55 assertions; inclui conta/ajuste/bloqueio, transferência, rollback na segunda ponta, baixa/reversão/recorrência, tenant/permissões e integração PDV. Suíte pgTAP completa passou antes da ampliação final dos testes focados; todos os 55 focados passaram depois.
- Concorrência real: duas sessões com mesma chave geram uma transferência (duas pontas, um recibo, um audit); duas baixas com chaves diferentes e mesma versão geram um único débito. Script reproduzível em `tests/phase8-finance-concurrency.ps1`, exclusivamente no container local, com fixtures locais identificadas no resultado.
- Node completo: 596/596; typecheck e build passaram; lint sem erros e 20 warnings preexistentes. Ajustes posteriores de indexação do read-model tiveram os 10 testes focados reexecutados, com validação final do build antes do PR.
- Migration remota target-only `20261022020059_phase8_finance_2.sql`: dry-run listou somente esse arquivo; aplicada sem repair/include-all/reset. Antes/depois: 37 lançamentos, todos receita/pago, soma R$8.215,77 inalterada. Nenhum lançamento sem conta; RLS nova ativa; grants diretos/anon/implementação legada revogados.

## Limitações deliberadas

Histórico em conta de integração não é conciliação bancária. Pagamentos de Pedidos continuam na autoridade existente, com envio da versão pelo cliente; o contrato legado de recebimentos não foi convertido em um novo livro. Não há provider de cobrança, comissões ou DRE nesta fase. Preview, merge e Production ainda precisam de seus próprios gates; os resultados acima não equivalem a PASS final.
