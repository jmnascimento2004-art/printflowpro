# Fase 11H auditoria arquitetura e validação antes da publicação

Base: `3e1e805071a35925ddf467ac5680651b204d799b`, main/origin/main limpas e divergência 0/0 no início. Branch `feat/phase11h-composite-products-outsourcing`. Entrega no PR #56.

## Auditoria e fontes canônicas

Produtos já possuíam pricing_type, sale_mode, composição de custos Fase 6, variações, faixas e catálogo. O kit comercial anterior não era uma BOM. resolveProductCost e resolveProductPrice permanecem canônicos; a estrutura física não cria outro motor de preço.

Estoque mantém products.current_stock, stock_movements e adjust_inventory_stock. A precisão dos mesmos saldos e quantidades de Compras foi ampliada para seis casas; não há conversão automática, reserva inventada ou custo médio novo. Produtos simples mantêm o fluxo existente.

Produção mantém production_queue e suas transições. A dedução do produto próprio foi suprimida somente para composto/kit estrutural. Compras, recebimentos, parcelas e Financeiro continuam nas fontes Fases 11G e 8; a OT é documento técnico vinculado a um PC.

## Estrutura e integridade

BOM de um nível, com referências reais por ID, quantidade, unidade, base física, perda, ordem, opcionais, fornecedor preferencial e prazo. Não há auto-referência, ciclos ou aninhamento. Kit virtual tem composição fixa, preço próprio e nenhum saldo próprio. Terceirização é processo/componente; não substitui o tipo estrutural.

O snapshot por item do Pedido fica em private.order_component_snapshots. Custos e fornecedores internos não foram acrescentados às colunas de order_items legíveis pelo Store. Alterações posteriores de cadastro não reescrevem o snapshot.

Composto registra consumo explícito na Produção; kit consome componentes na confirmação operacional. GET e realtime não movimentam estoque. Consumo, inverso, OT e transições usam permissão, SaaS, tenant, nonce, CAS e lock do Pedido. Opcionais usam a versão capturada do agregado; outra sessão ou formulário antigo recebe conflito. DML de item usa NOWAIT; BOM e alteração de unidade revalidam os filhos sob locks ordenados.

Falta de material reutiliza somente solicitação atual aberta ou saldo ainda pendente de uma Compra convertida correspondente ao produto/unidade. Nenhuma quantidade aprovada é aumentada silenciosamente. Serviços internos não físicos não geram movimento de estoque.

OT preserva fornecedor, Pedido/item/produção, especificação, quantidade, prazo e previsão. Permite envio, recebimento parcial, conferência, inverso, custo efetivo e cancelamento. O recebimento da OT não conclui automaticamente a Produção. Materiais enviados referenciam consumo já realizado; não existe saldo fictício em poder de terceiros nem entrada física de serviço.

## Schema aplicado

Quatro migrations aditivas target-only: `20261025024414`, `20261025024542`, `20261025030908` e `20261025045911`. A última bloqueia NaN nos valores monetários da OT. Custos previstos/frete inválidos foram reproduzidos no teste local antes da correção; o custo real já tinha proteção por limite e mantém essa validação.

FKs e índices preservam escopo por empresa, item/Pedido, produção, fornecedor, prazo e consumo. Nenhuma FK nova da Fase 11H foi apontada sem índice pelo advisor final.

## Validação

817 testes Node PASS; 31 arquivos pgTAP completos PASS, incluindo 97 cenários 11H. Concorrência local real passou para nonce simultânea, disputa de saldo, DML do item, BOM/unidade nas duas ordens e duas sessões de opcionais com CAS. Fixtures locais foram revertidas e encerradas.

Typecheck PASS; lint com 0 erros e 19 avisos preexistentes; build local e Preview PASS; diff check PASS. Revisão independente, incluindo os deltas finais: 0 BLOCKER/HIGH/MEDIUM/LOW acionáveis na mudança.

Preview autenticado exclusivamente na empresa PrintFlow SaaS QA 20261023. Desktop 1440×1000, tablet 820×1180 e mobile 390×844 conferidos para composição, necessidades, OT e relatórios; tabelas usam rolagem interna. Seletor e foco por teclado conferidos. Nenhuma largura de página excedeu o viewport.

Banner: referência R$ 14,45, preço R$ 100,00, medidas reais 1,20×0,80 m e área 0,96 m²; cobrança mínima 1 m² preservada. Com 5% de perda, consumo físico exato de 1,008 m². Serviço interno opcional de 1 un. não gerou estoque. Kit: referência R$ 4,00, preço R$ 40,00; duas unidades no PDV totalizaram R$ 80,00 e o Pedido consumiu automaticamente 4 un. dos componentes.

A solicitação de falta foi criada e reutilizada sem duplicar. A PC-0002 recebeu 1,008 m² e 4 un., total R$ 17,07. A OT-0001 recebeu 0,4+0,6 un., com conferência; previsão com frete R$ 7, custo efetivo com frete R$ 8 e diferença R$ 1. Gerou uma única PC-0003 de serviço e uma única obrigação de R$ 8, sem pagamento ou entrada física.

Produção permaneceu independente do status da OT. Expedição com recebimento parcial foi recusada com mensagem de dependência e o Pedido continuou em produção. Após recebimento completo, conclusão explícita pelo quadro passou; o card foi reaberto para os inversos QA.

PDF A4, especificação longa e palavra sem quebra passaram por renderização e limites de página. Viewer real, download, impressão nativa cancelada pelo usuário e rascunho WhatsApp conferidos; nenhuma mensagem enviada. Seleção rápida da OT seguida de PDF/WhatsApp, Voltar e reload passaram após usar deep links client-side, preservando o documento durante atualizações.

## Encerramento QA e empresa real

PED-0001/0002 e OT-0001/0002 cancelados; recebimentos técnicos e comerciais revertidos; consumos revertidos explicitamente; PC-0002/0003 canceladas. Conta a pagar cancelada pela compra canônica, sem pagamento. Saldos dos dois materiais e líquido do ledger ficaram zero.

Seis produtos QA ocultos do catálogo foram inativados por manutenção escopada a IDs/empresa, com assertions de saldo zero e operações encerradas; nenhum produto, BOM, snapshot ou histórico foi apagado. Fornecedor sintético inativado pela interface; conta financeira QA 11G restaurada inativa, saldo zero. Caixa PDV abriu/fechou em zero, sem venda finalizada.

Assinatura mock restaurada a Essencial mensal, cancelada, cancel_at_period_end=true e somente leitura; cobrança real=false. Categoria e registros históricos anteriores foram preservados.

Baseline CibelePRINT reconfirmada: 42 Pedidos, 2 movimentos de estoque, 47 transações financeiras, 0 fornecedores, 0 Compras e 0 OTs. Nenhuma operação de negócio ou marca da empresa real foi alterada.

## Segurança limites e publicação

Os dois avisos de RPC SECURITY DEFINER autenticada da 11H são intencionais: composite_command e composite_source validam identidade, empresa e permissões; as mutações também validam SaaS, nonce e versões. Três tabelas privadas têm RLS sem policies e acesso revogado aos clientes, negando leitura direta. Avisos de search_path, proteção de senha e performance anteriores à fase permanecem fora desta mudança; não se declara advisor bruto sem avisos.

V1: BOM plana, kit virtual fixo, sem reservas, conversões genéricas, estoque de terceiros ou margem paralela. Agenda mantém a fonte existente; não foi criada agenda paralela. Prazos e atrasos da OT ficam no módulo e na Produção.

Este registro cobre a validação anterior ao merge. SHA de main, resultado da publicação e smoke somente leitura de Production constam no relatório final de 88 pontos. A Fase 11I não foi iniciada.