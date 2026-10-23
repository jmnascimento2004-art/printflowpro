# Fase 11A — Comissões

Base confirmada: `b23ab837b33b7574570aed5c54d8f820532dee2b`, `origin/main` igual à main local,
worktree/stage limpos e divergência 0/0 antes da branch `feat/phase11a-commissions`.
Benchmark oficial preservado sem alterações: B31/S11 exige obrigação comercial auditável,
sem confundir a estimativa de custo do pricing com comissão devida.

## Modelo e escolhas explícitas

O comissionado é um `profile` existente, interno, ativo e habilitado explicitamente na regra de vendedor.
Não existe cadastro paralelo de vendedores. Admin, gerente, financeiro e vendas podem ser habilitados;
parceiros externos sem profile ficam fora desta primeira versão. Não inferimos vendedor pelo operador,
ator do Audit Log, produção, último editor ou cliente. A atribuição Order → profile tem CAS e auditoria.
Pedidos legados sem atribuição não geram comissão. Atribuir vendedor não altera o Pedido canônico.

Origens manual, orçamento convertido, PDV e Store são escolhidas explicitamente na atribuição e
permitidas pela regra. Origem Store já registrada no Order não pode ser substituída. B2B é condição
de faturamento do cliente; Revenda é terceirização dos itens, não um segundo tipo de Order.

O módulo inicia desativado. A regra padrão proposta é 5%, venda líquida após desconto,
sem frete, somente após quitação comprovada pelos recebimentos ativos do ledger.
Cada vendedor pode herdar a regra padrão ou usar regra percentual/fixa própria.
Não implementamos matriz por produto/categoria, margem histórica ou parcelamento da comissão nesta versão.

Bases configuráveis:

- **Venda líquida + serviços:** `max(total_amount − shipping_cost, 0)`.
- **Somente produtos:** venda líquida sem frete × subtotal dos produtos / (produtos + serviços).
  Serviços e produtos usam seus totais persistidos; sem denominador, base zero.
- Desconto reduz a base por padrão: já está no total do Order, não é subtraído novamente.
  Desativar essa opção usa a soma persistida dos itens e serviços antes do desconto.
- Frete pode ser incluído explicitamente; é somado depois do rateio de produtos.
- Taxas financeiras não são descontadas automaticamente.
- Percentual usa `numeric`/round no PostgreSQL, duas casas; fixo é por Order com base positiva.

Elegibilidade configurável: venda operacionalmente aprovada ou somente após quitação (padrão).
Quitação usa receitas efetivamente pagas, não canceladas/revertidas, do ledger canônico;
o cache `orders.paid_amount` sozinho não comprova pagamento. Recibos por `order_id` têm prioridade;
legados sem ID podem usar o número canônico PED/ORD. Um estorno sem Order explícito resolve
a origem por `reversal_of`. Venda cancelada ou aguardando aprovação não gera comissão válida.

## Fechamento e histórico

Competência é a data civil do Order em America/Bahia, inclusive quando a política exige quitação.
Períodos são mensais por padrão; customizados até 366 dias, sem sobreposição. Quitação tardia exige
reabrir conscientemente o período original. Não há redistribuição silenciosa para outra competência.

Aberto → Fechado → Aprovado → Pago. Fechamento cria snapshots de Order, cliente, vendedor,
regra/revisão, base, percentual/fixo e valor. Mudança futura na regra não altera o ciclo fechado.
Claim único por Order impede duplicação entre períodos/regras/retries. Filtros visuais não limitam fechamento.

Reabertura exige motivo e ausência de pagamentos ativos. Incrementa o ciclo e invalida o claim antigo,
preservando os snapshots, ajustes e pagamentos/reversões no histórico. O novo ciclo usa regras vigentes.
Não é permitido reabrir um período pago sem reversão controlada.

Editar observação/prazo continua permitido. Guard monetário exige reabertura antes de mudar o total,
frete ou serviços de uma venda fechada. A persistência agregada pode apagar/reinserir itens iguais;
uma constraint diferida compara somente a soma final, permitindo esse fluxo sem alterar a base histórica.

Ajustes positivos e negativos são registros separados, com motivo e ator. Cancelamento ou reversão
da quitação cria ajuste negativo único e marca o período para revisão. Snapshot não é apagado.
Se já houve pagamento, o painel mostra valor a recuperar. Não se executa estorno bancário automático.

## Financeiro e integridade

Liquidação total por vendedor/ciclo: uma saída `financial_transactions`, tipo despesa,
source commission, movement, operating, status pago, conta bancária ativa e data informada.
O vínculo é com o pagamento/período/vendedor, nunca com um único Order de uma despesa conjunta.
Não existe segundo livro ou saldo bancário calculado em paralelo. O registro é interno;
nenhum banco externo é acionado. Financeiro e DRE caixa incluem os movimentos existentes.

Reversão cria receita compensatória na mesma conta, referencia `reversal_of`, preserva a saída e
marca o pagamento revertido. O período volta a Fechado para conferência/aprovação. Operação, ledger,
status, snapshot e Audit Log são transacionais. Falha financeira não deixa recibo de sucesso ou pagamento parcial.
RPC financeira genérica não pode reverter/cancelar esse movimento: deve usar Comissões.

Commands usam recibo de idempotência por tenant, operação, payload e ator; revisões impedem ações obsoletas.
Lock transacional serializa comissões por tenant. Alteração concorrente de venda/recibo relevante
usa try-lock e erro 40001 para retry, impedindo inversão de locks com Order já bloqueado.
Os testes reais incluem fechamento × estorno de recibo legado sem Order ID.

## Segurança, UI e relatório

As seis tabelas públicas têm RLS e apenas SELECT para authenticated; escrita somente por commands.
Permissão estrita de `/financial`, inclusive negação configurada para admin. Profiles, conta, vendedor,
Order, período e recebimentos são validados pelo tenant derivado do usuário, nunca do payload.
SECURITY DEFINER tem search_path vazio e execução pública revogada. Helpers ficam no schema privado.
Visão própria do vendedor sem acesso financeiro fica para uma etapa posterior, sem novos permission keys.

Audit Log registra regras, atribuição, período criado/fechado/aprovado/reaberto, ajustes, pagamento e
reversão. Não registra números bancários completos. Navegação/estimativa não são eventos auditáveis.

Financeiro → Comissões; Central de Relatórios possui atalho condicionado ao acesso financeiro.
Dashboard, filtros, vendedores, detalhe Order/cliente/data/base/regra/valor, histórico por ciclo e CSV.
Origem filtra detalhes; totais/ajustes/liquidação abrangem o vendedor/período completo.
CSV reutiliza o exportador seguro da Fase 9, com neutralização de fórmulas. Não há cálculo alternativo no browser.
Modal gerencia foco, trap, Escape, restauração e rolagem; mutações e retries têm bloqueio de double-submit.

Índices por tenant/período/vendedor/Order e recebimentos ativos por ID/número. Janela de até 10 mil
Orders por análise/fechamento; API devolve 50 linhas por página, CSV até a janela completa.
Seletor de atribuições limita aos 1.000 Orders mais recentes; históricos de ciclos são limitados a 1.000 registros.

## Evidências em desenvolvimento

- 61 verificações pgTAP focadas: cálculo, desconto, frete, fixo, override, quitação, rounding,
  fechamento/retry/snapshot, edição agregada, ajuste, rollback, ledger, cancelamento, reversão,
  reabertura/histórico, isolamento e permissões.
- Node: 12 focados, 706 completos aprovados.
- Quatro casos reais de concorrência local aprovados: close/retry e refund concorrente;
  pagamento/retry único; reversão com um vencedor; refund posterior com ajuste único e caixa neutro.
- Duas fixtures antigas de Reports/Growth foram alinhadas ao fuso Bahia: current_date UTC após
  meia-noite não deve ser usado como dia civil da aplicação.
- Revisão independente pré-migration sem BLOCKER/HIGH/MEDIUM/LOW acionáveis após correções.

Não declarar PASS antes de migration target-only, Preview, checks, merge, Production e smoke.
Não iniciar 11B automaticamente.

Migration remota aplicada target-only: 20261023013215_phase11a_commissions.sql. O nome local foi alinhado à versão registrada no ledger pelo serviço; sem repair/replay/reset/include-all. Seis tabelas públicas com RLS; baseline de regras/períodos/pagamentos vazia. Advisors: nenhum novo FK sem índice; RLS sem policy é intencional em private.commission_commands. As duas RPCs autenticadas SECURITY DEFINER são intencionais, com identidade/tenant/permissões verificados; avisos antigos de search_path e proteção de senha permanecem fora deste escopo.
