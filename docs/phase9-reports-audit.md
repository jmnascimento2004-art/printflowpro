# Fase 9 — DRE Gerencial por Caixa e Relatórios

Base: `f839f010263cb83ea277baadcce43ad39a2f8183`, confirmada com origin/main em 22/10/2026. Stage vazio, divergência 0/0; o benchmark oficial preexistente não rastreado foi preservado. Nenhuma tabela de DRE, saldo ou recebimento foi criada.

## Fontes e granularidade

| Fonte | Grão e autoridade | Utilização |
|---|---|---|
| financial_transactions | Um movimento ou título por id/company_id; type/amount; paid_at, due_date, created_at; account_id/category_id; source/economic_kind; payable_id/reversal_of; actor_user_id | DRE e relatório financeiro: somente movement, pago, sem cancelled_at. Título payable nunca duplica seu pagamento. |
| financial_accounts | Uma conta por id/company_id | Dimensão de conta, sem saldo mutável. |
| financial_categories | id/company_id, nome e tipo receita/despesa | Categoria estruturada prioritária. Histórico sem ID usa categoria exata, nunca substring. Não há grupos contábeis de deduções/outros. |
| orders + order_items | Pedido e itens históricos | Vendas comerciais, quantidades, mix e ticket. Não geram receita paralela na DRE. Frete/serviços/descontos podem explicar diferença entre itens e total do Pedido. |
| customers | Cadastro, tags e condições B2B | Ranking compartilhado da Fase 5; recebíveis reutilizam buildReceivableRows/finance-rules da Fase 8. |
| suppliers | Cadastro do fornecedor | Dimensão tenant-scoped do movimento, herdada do original em reversões. |

Data caixa: `coalesce(paid_at em America/Bahia, due_date, created_at em America/Bahia)`. Datas civis não passam pela meia-noite UTC. Origem financeira existe; canal comercial confiável Store/PDV não existe no Pedido. Não se infere canal por notas, tags ou número. source_quote_id somente comprova vínculo a orçamento.

## Fórmula e conciliação

Receita bruta realizada = movimentos operacionais de receita menos suas compensações efetivas. Despesa operacional = saídas operacionais menos compensações efetivas. Resultado = receita menos despesa. Receita líquida coincide com bruta nesta classificação, pois não existem grupos estruturados de deduções. Taxas gerenciais configuradas não são deduzidas como se tivessem sido pagas. Não se inventa grupo contábil por texto.

Reversão herda tipo, categoria, origem, fornecedor e classificação do original e usa sua própria data caixa. O original com reversed_at permanece na história; compensação em outro mês afeta aquele mês. Status atual do Pedido não faz caixa histórico desaparecer. Cancelled_at exclui movimento anulado. A mesma RPC alimenta DRE principal, analítico, gráficos, CSV e PDF.

Transferência, abertura, capital e ajuste ficam fora do resultado, mas aparecem na ponte: **resultado + movimentos excluídos = fluxo líquido do filtro**. Transferência entre contas é zero no consolidado; um filtro de conta pode mostrar uma ponta na ponte, sem virar receita/despesa.

Recebíveis são exposição **atual dos Pedidos criados no período**, claramente independente dos filtros de caixa. Não são receita realizada nem saldo histórico na data final. Pagamentos parciais e saldo usam as mesmas regras canônicas da Fase 8, sem segunda exposição B2B. Atraso usa vencimento/prazo canônico e data atual. Financeiro continua com sua tela completa de obrigações por vencimento.

Comparativo: janela anterior contígua com igual número de dias; base zero retorna percent=null. Margem sem receita positiva e média diária sem dias de movimento exibem sem base.

## Leitura, autorização e escala

reports_source aplica tenant e permissão estrita no banco; configured roles=[] nega inclusive admin. Financeiro exige /financial; Vendas /orders; Produtos /products + /orders; Clientes /crm + /orders. Menu /reports é somente navegação. API e exportação repetem autorização e usam cliente autenticado, sem service role. Helpers privados não são executáveis pelos clientes; RPCs SECURITY DEFINER têm search_path vazio, auth.uid, tenant e grants mínimos, sem writes.

Agregados financeiros e séries saem do banco. Movimentos são paginados em 50 linhas. Fontes comerciais são consultadas por período e processadas somente no servidor; ranking é o helper compartilhado. Nenhum ledger integral é carregado pelo browser. Limites explícitos: período de até 366 dias de diferença, 10 mil Pedidos, 50 mil itens/lançamentos associados de exposição, mil grupos, 500 contas/categorias/opções de clientes, exportação até 10 mil linhas. Exceder limite gera erro; não há resultado parcial silencioso. JSON de grupos, cadastros e exposição usa limite n+1 antes de serializar. Uma dimensão com cadastro global acima do limite exige evolução de busca paginada, não redução de período.

Índices acompanham consultas reais: company_id + cashdate (somente movimentos pagos), company_id/created_at/id em Orders e company_id/número normalizado para fallback histórico. O teste transacional com 5 mil Pedidos/recebimentos caiu de 3473 ms para 225 ms após separar join por ID do fallback indexado. Não há materialized view ou N+1 HTTP.

## Exportação e preferências

CSV no servidor respeita autorização, período, filtros e colunas permitidas. BOM UTF-8, separador ponto e vírgula, aspas/newlines escapados e proteção contra fórmulas em texto. Números negativos continuam numéricos. Cache privado/no-store e nosniff. Limite excedido pede janela menor. PDF é resumo financeiro/DRE gerencial, com filtros, ponte e ressalvas; usa @react-pdf/renderer existente. XLSX é evolução futura.

Colunas e até dez presets nomeados de filtros são preferências locais por company/profile, sem tabela financeira ou configuração empresarial nova. Não precisam Audit Log. Relatórios e exportações são somente leitura e não geram eventos financeiros.

## Limites de interpretação

Competency_date foi preenchida com due_date e não é reconhecimento confiável. Competência depende de política de reconhecimento de receita/despesa, apropriações, parcelas e provisões. Esta fase não oferece DRE por competência, obrigações fiscais, balanço, comissão ou margem de produto sem custo histórico. Ranking mantém cadastro atual e tags; pedidos sem cliente vinculado são divulgados fora do ranking. Recorrência e última compra referem-se ao período.

Advisors de segurança foram inspecionados antes da migration: avisos preexistentes de helpers/trigger e Auth permanecem fora desta mudança; funções públicas autenticadas com SECURITY DEFINER são intencionais e protegidas por autorização interna, conforme revisão e testes de negação/tenant. Não foi enfraquecida proteção.
