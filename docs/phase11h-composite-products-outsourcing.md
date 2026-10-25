# Fase 11H — auditoria e decisões

Base confirmada: `3e1e805071a35925ddf467ac5680651b204d799b`, main/origin/main limpas, divergência 0/0. Branch `feat/phase11h-composite-products-outsourcing`.

Produtos possuem `pricing_type`, `configurator_options.sale_mode` (inclui kit), custo manual/composição Fase 6, opções, variações, faixas e catálogo. Kit atual não é BOM. `resolveProductCost` e `resolveProductPrice` continuam canônicos. O preço próprio do kit será preservado.

Estoque usa `products.current_stock`, `stock_movements` e `adjust_inventory_stock`. Não há reservas nem custo médio. Precisão atual de duas casas não representa 1,008 m²; ampliar o mesmo estoque para seis casas preserva os valores existentes. Unidade física explícita não introduz conversões.

Produção usa `production_queue` por item do Pedido, etapas independentes, responsável e CAS em `transition_production_stage`. A entrada atual na fila dispara dedução client-side do produto simples. Essa dedução deve ser suprimida para compostos/kits, cujo consumo de componentes será transacional no servidor. Carregamento/realtime não executará comandos.

Compras usa `supplier_products`, `purchase_orders`, recebimentos e `finance_command`. OT será documento técnico com vínculo comercial a um PC canônico; não cria financeiro paralelo. Pagamento permanece no Financeiro.

Primeira versão: BOM de um nível, sem auto-referência ou aninhamento, ordenada; componente real referenciado por ID. Kit virtual sem estoque próprio. Composto usa consumo explícito na Produção; kit consome componentes na confirmação operacional da venda, com inverso explícito. Snapshot servidor em tabela privada vinculada ao item do Pedido preserva coeficientes, perdas, custos e especificação; alterações posteriores de cadastro não reescrevem o histórico. Mudanças de quantidade/dimensões após consumo ou OT exigem encerramento/reversão.

Base física: quantidade, área real, comprimento ou perímetro em metros. Área mínima é somente comercial. Perda técnica multiplica o físico. O custo é projetado na composição Fase 6, com referência separada do custo físico do Pedido; preço final continua na resolução existente.

OT: fornecedor canônico substituível antes da confirmação, especificação congelada, quantidade/prazo/custo previsto, envio e recebimentos parciais com conferência e motivo de reversão. Custos reais são explícitos e auditados. Conclusão da Produção verifica dependências reais, sem copiar status da OT. Envio de materiais utiliza consumo já registrado e referência operacional; não haverá saldo fictício em poder de terceiros nem entrada física de serviço.

Gates: migrations target-only locais antes de remotas; testes Node/pgTAP/concorrência; typecheck/lint/build/diff; revisão independente 0 B/H/M; Preview desktop/tablet/mobile; reversão/encerramento QA; PR Draft→Ready→merge; Production e smoke somente leitura. Fase 11I fora do escopo.

Validação antes do Preview: 817 testes Node; 31 arquivos pgTAP completos (94 cenários 11H); typecheck/build PASS; lint 0 erros/19 avisos preexistentes; diff check PASS. Revisão independente estática final 0 B/H/M. Concorrência real local validou nonce simultânea, disputa de saldo, DML de item vs consumo e as duas ordens de gravação BOM/unidade. Fixtures locais revertidas, pedidos cancelados, produtos inativos e saldo zero.

Migration principal aplicada target-only como `20261025024414`, sem dados de negócio reais alterados. Baseline CibelePRINT mantida: 42 Pedidos, 2 movimentos de estoque, 47 transações financeiras, 0 OTs. Advisor identificou FK de consumo sem cobertura completa; índice tenant/consumo em migration aditiva separada. RPCs SECURITY DEFINER autenticadas são intencionais, com tenant/permissões/SaaS/nonce/CAS validados; tabelas privadas com RLS sem policy negam clientes. Avisos preexistentes de search_path e proteção de senha não foram alterados nesta fase.

Solicitação de falta reutiliza apenas material/unidade atuais em solicitação aberta ou saldo ainda não recebido na Compra convertida. Compra encerrada/recebida e solicitação alterada para outro material permitem novo rascunho. Não há reserva implícita nem alteração automática de quantidades aprovadas. Snapshot interno fica privado; somente o tipo estrutural público acompanha o item Store. Kit V1 é fixo; opcionais são escolhidos na composição produtiva antes de qualquer histórico. Duplicação de cadastro simples permanece; compostos/kits exigem novo cadastro e definição própria para não copiar custo sem sua estrutura.

A seleção de opcionais usa a versão capturada do Pedido, sob lock, e altera a versão do agregado na mesma transação. Formulário antigo recebe CONFLICT; outra sessão com versão antiga é recusada; retry exato usa o recibo da nonce. A UI preserva o rascunho até recarregamento explícito. Migration aditiva 20261025030908. Concorrência real local comprovou esses cenários, além de 94 testes SQL focados.

Preview autenticado exclusivamente no tenant QA: seis produtos cadastrados com saldo inicial zero e fora do catálogo público. A BOM do banner manteve referência de R$14,45 e preço de R$100,00; o kit manteve referência de R$4,00 e preço de R$40,00. O Orçamento mostrou área real de 0,96m² e base comercial de 1m². O PED-0001 preservou snapshot privado. A falta de 1,008m² criou e reutilizou uma única solicitação. A PC-0002 recebeu 1,008m² e 4un por R$17,07. O consumo explícito retirou exatamente 1,008m²; o serviço interno de 1un não gerou movimento físico. Validações de OT, kit, encerramento QA, larguras e publicação seguem em andamento.
