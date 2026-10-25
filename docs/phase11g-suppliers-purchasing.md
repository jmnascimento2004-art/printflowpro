# Fase 11G — Fornecedores e Compras

Base auditada: `77d374006e9a7b9af7ebeb09f13a65b87ece93da`. Registro canônico: `suppliers`; materiais e serviços: `products`; quantidade: `products.current_stock`; razão de estoque: `stock_movements`; obrigações e pagamentos: `financial_transactions` / `finance_command`. Não há compras anteriores nem regra de custo médio no estoque atual. Nenhum desses livros será duplicado.

## Regras da integração

- Produtos controlados entram pela operação existente `adjust_inventory_stock`, na unidade canônica do produto. Conversão de unidades não é presumida. Serviços e produtos sem controle registram recebimento sem movimento físico.
- O custo efetivo de cada linha é seu valor proporcional ao total do pedido, incluindo desconto global, frete e despesas. Arredondamento monetário ocorre no servidor; diferenças entre acumulados arredondados distribuem o resíduo sem produzir linhas negativas. O histórico fica no recebimento e nunca altera automaticamente `base_cost`, preço de venda, tiers ou referência do fornecedor. O sistema atual não calcula custo médio.
- Confirmação congela fornecedor, descrições, unidades, preços e condições. Parcelas têm datas e valores explícitos, cuja soma deve coincidir com o total. A ação separada **Gerar contas a pagar**, após confirmação, exige acesso simultâneo a Compras e Financeiro e chama a operação financeira existente. Não registra pagamento. Pagar e estornar continuam em Financeiro.
- Cancelamento exige ausência de recebimentos ativos e pagamentos ativos; cancela obrigações pendentes pelo Financeiro. Recebimentos são revertidos integralmente por recebimento, com movimento inverso, sem apagar o histórico e sem permitir estoque negativo.
- Aprovação de solicitação e confirmação usam `/purchases/approve`; recebimento e reversão usam `/purchases/receive` e `/stock`. As permissões configuradas prevalecem inclusive para administradores. A assinatura SaaS é respeitada.
- Anexos são privados e vinculados a fornecedor ou compra do mesmo tenant. Não há interpretação fiscal automática de XML nem emissão fiscal. Email fica indisponível por ausência de infraestrutura de envio para compras.
- Datas previstas aparecem no painel de compras; não criam uma agenda paralela. Relatórios de compras partem dos próprios pedidos/recebimentos e se conectam ao centro de Relatórios.

## Gates de entrega

Migration aditiva validada localmente antes de aplicação remota; Node completo; pgTAP completo; typecheck, lint, build e diff check; revisão independente sem BLOCKER/HIGH/MEDIUM; Preview autenticado desktop/tablet/mobile; limpeza de QA por reversão/cancelamento; PR e checks; publicação e smoke somente leitura. A Fase 11H não faz parte deste trabalho.

## Evidência antes do Preview

Migration remota 20261024234135, nome phase11g_suppliers_purchasing, aplicada isoladamente no projeto dyqqhhywiubjraxyebgr. Antes/depois: CibelePRINT com 0 fornecedores, 2 movimentos de estoque e 47 lançamentos financeiros. Nenhum pedido de compra criado em empresa real. Bucket purchase-documents privado.

99 cenários pgTAP focados; suíte SQL completa com 30 arquivos; 801 testes Node; duas conexões concorrentes; typecheck; lint sem erros (19 avisos anteriores). Revisão independente do código: 0 B/H/M/L. Preview, revisão visual e publicação ainda são gates pendentes nesta revisão.

Prova A4 sintética renderizada com Poppler e inspecionada; logo protegido pela allowlist canônica de Storage/PNG/JPEG inline, cabeçalhos sem sobreposição, parcelas reconciliadas, rodapé numerado e documento longo sem página vazia/corte. O helper de logo é compartilhado com Pedidos. Três testes PDF novos e 23 regressões de documentos aprovados.

Validação autenticada QA: solicitação editada/enviada/aprovada/convertida; PC-0001 com subtotal140 e total150; estoque0→4→10 em dois movimentos, serviço sem estoque e custo base8 preservado; duas obrigações75 pendentes sem pagamento automático; XML privado registrado; viewer, download e impressão nativa confirmados. Ajustes finais: deep link por transactionId reaproveita foco financeiro da Agenda; timestamps de anexos usam America/Bahia sem deslocar datas civis. Limpeza, revisão visual final e publicação continuam pendentes nesta revisão.
