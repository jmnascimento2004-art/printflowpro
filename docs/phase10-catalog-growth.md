# Fase 10 — Growth do Catálogo

Estado: implementação e revisão de código concluídas; Preview e Production pendentes.

## Auditoria e decisões

Base `2df872038e53c5550c0eaf5984f8e221b561cf82`, branch `feat/phase10-catalog-growth`.
Auditoria remota em 22/10/2026: projeto `dyqqhhywiubjraxyebgr`, PostgreSQL 17;
ledger mais recente `20261022121115`. Não existem tabelas de analytics/cupons/marketing;
`products` não tem ordem editorial global. O bootstrap público já restringe produtos e preços.
O checkout antigo chama uma RPC administrativa de orçamento: substituir por fronteira server-side,
com empresa resolvida pelo hostname, preço canônico recalculado e transação idempotente.

Não inferir origem por tags ou nomes de clientes. Novas Quotes recebem origem Store explícita;
Orders preservam essa origem e o snapshot de cupom por `source_quote_id`, na aprovação existente.
Não retroclassificar histórico de origem desconhecida. Nenhum segundo sistema de pedidos.

## Métricas

Janela civil America/Bahia, início inclusivo/fim exclusivo, máximo 366 dias. Listas limitadas.
Sessões são aleatórias, expiram após 30 minutos de inatividade, somente após opt-in analytics.
Funil conta sessões distintas por etapa, entre as sessões iniciadas na janela, sempre com o mesmo
denominador: sessão, produto visto, carrinho, checkout, orçamento enviado, Pedido aprovado.
Repetições de ações podem aumentar eventos, mas não a contagem de sessões de cada etapa.
Pedidos e receita comerciais incluem Orders Store reais, excluindo cancelados/orçamentos,
independentemente de consentimento. Receita comercial não significa recebimento financeiro.
Ticket = receita / Orders válidos. Bases vazias produzem zero ou taxa indisponível, nunca 100%.
Conversão monitorada usa somente sessões consentidas; não dividir Orders sem sessão por sessões monitoradas.

Buscas rejeitam possíveis emails, documentos, telefones e termos sensíveis; não guardam texto bruto rejeitado.
Sem IP, user-agent, referrer completo, querystring, fingerprint ou identificador de cliente nos eventos.
Analytics não alimenta Audit Log. Eventos de aprovação são derivados de Orders canônicos, não do browser.

## Integridade e privacidade

Cupons são desconto comercial após pricing canônico, somente sobre itens elegíveis, sem frete.
Normalização trim/uppercase, unicidade tenant, limites atômicos sob lock, uma utilização por operação.
Retry com payload diferente é conflito; retry idêntico retorna o mesmo orçamento e uso.
Snapshot code/type/amount permanece no orçamento/Pedido após exclusão do cupom.
Exclusão de orçamento preserva o recibo mínimo da operação e o uso do cupom; repetir a mesma operação
não recria um orçamento removido administrativamente. Limites contam orçamentos enviados e não são
liberados automaticamente por cancelamento ou exclusão.
Limite por sessão usa cookie aleatório necessário à operação comercial; não é fingerprint.

Prova social aprovada tecnicamente somente para compras reais aprovadas, com produto público e texto
“Alguém comprou”. Não expõe cliente, localização, horário exato, ID de Pedido ou telefone.
Desativada por padrão, dispensável e uma mensagem por vez; escondida durante checkout no mobile.
Seções manuais existentes são preservadas. Nenhuma automação de +Vendidos nesta fase.

## Crescimento e retenção

Índices compostos por tenant/tempo e tenant/sessão; payload estrito e limites por sessão/requisição.
Dashboard agrega no PostgreSQL, nunca transfere histórico bruto. Monitorar tamanho, ingestão e latência;
quando houver volume real, definir retenção agregada com o responsável. Nenhum job destrutivo arbitrário.
Migrations aditivas e target-only; sem repair, reset ou include-all. Validar localmente antes do remoto.

## Evidências

- Node completo: 690/690; focados Growth: 18/18 (inclui consentimento, revogação e StrictMode).
- pgTAP completo: 22 arquivos; Growth ampliado para 75 verificações aprovadas.
- Concorrência real local: duas requisições da mesma operação criam uma Quote/um uso;
  disputa pelo último uso tem um vencedor; primeiro save de Marketing tem um vencedor e um conflito CAS.
- Typecheck e build aprovados; lint sem erros, 20 avisos preexistentes de imagens; diff check limpo.
- Revisão independente: zero BLOCKER/HIGH/MEDIUM/LOW acionáveis em código.
- Migration remota aplicada isoladamente por MCP: `20261022234153_phase10_catalog_growth.sql`.
  O nome local foi alinhado à versão realmente registrada pelo serviço; sem repair ou replay do histórico.
- Complemento `20261022235140_phase10_catalog_growth_preview_refinements.sql`: KPI explícito de cliques
  sobre eventos existentes, sem modificar preços, grants ou os documentos canônicos.
- Preview da branch usa `STORE_PREVIEW_CANONICAL_HOST=store.cibeleprint.com.br`, restrito à branch
  `feat/phase10-catalog-growth`; não altera Production nem permite escolher empresa no browser.
- Seis tabelas Growth com RLS; sem grants de navegação/checkout ao browser. RPCs públicas de Store
  só executáveis pelo serviço; RPCs Admin autenticadas checam perfil, tenant e permissões.
- Advisors: nenhum FK Growth sem índice. RLS sem policies é intencional nas tabelas service-only.
  Avisos de RPC SECURITY DEFINER autenticada foram revisados (permissão explícita); os demais avisos
  de search_path antigo e proteção de senha antecedem esta fase e não foram alterados.
- Base funcional oficial `printflowpro-benchmark-gap-analysis.md` preservada sem alteração:
  SHA256 `3D66CCB8DBA44A727FE8AC608313CC4087BDCE81C515124139826BB887943D8F`.

`order_created` é derivado da criação real de Order com origem Store na aprovação canônica;
o browser não pode publicar uma compra. Nenhuma duplicação de evento via trigger e frontend.

Não declarar PASS antes de Preview, checks, merge, Production e smoke.
