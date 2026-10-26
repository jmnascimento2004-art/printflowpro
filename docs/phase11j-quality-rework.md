# Fase 11J — auditoria e arquitetura

Base real: `7d141ca62ba631827d54f58295d37b34d821f9f0`, main limpa, stage vazio, origin/main 0/0. Branch solicitada: `feat/phase11j-quality-rework`. Não há AGENTS.md aplicável encontrado no repositório. Fase 11K fora do escopo.

## Auditoria

- Não existem tabelas/fluxo de NC, reinspeção ou retrabalho. A qualidade editorial do Catálogo (Fase 10) e `outsourcing_receipts.quality` (aceito/com ressalvas) são outros conceitos e permanecem intactos.
- Produção usa uma fila canônica por item, CAS em `transition_production_stage`, responsável e timestamps. Fases expostas: fila, impressão/preparação, produção e concluído. Conclusão pode criar a expedição canônica uma vez. Consumo original de componentes e OTs é conferido pelo guard 11H.
- Compras usa PC, itens, recebimentos com linhas, ledger físico, reversão integral de recebimento e parcelas/obrigações canônicas. Devolução deve remeter a esse fluxo explícito; não criar crédito ou estorno paralelo na Qualidade.
- OT usa Pedido/item/Produção, fornecedor, quantidade parcial recebida e PC próprio. Custo vinculado à OT deve aproveitar seu fato canônico, sem gerar outra obrigação.
- Serviços Externos tem rodadas, checklist, evidências privadas, aceite, impedimento e conclusão/reabertura auditadas. Retorno técnico de NC será um vínculo ao serviço canônico 11I, não outra agenda.
- Estoque usa `private.move_inventory`; financeiro usa `finance_command`; relatórios são leitura, com gate SaaS reports e regras de acesso financeiro. Nenhuma autoridade de tenant, custo ou status será delegada ao browser.

## Decisões de domínio

NC própria, sequência NC por tenant e origem validada no servidor (Pedido/item, Produção/etapa, PC/recebimento, OT ou serviço). Contexto técnico da origem fica preservado. Responsabilidade operacional interna/fornecedor/equipe não é uma classificação punitiva.

Ações corretivas têm versão, quantidade parcial/total, execução, responsável, prazo/impacto e resultado. Reprovação de reinspeção exige nova ação/versão, preservando ação e inspeção anteriores. Encerramento registra snapshot; reabertura restrita inicia novo ciclo sem apagar o anterior.

Retrabalho interno reutiliza o mesmo registro de `production_queue`, por comando explícito: arquiva a execução anterior na história canônica, incrementa a rodada, identifica RETRABALHO/NC, aplica quantidade operacional parcial e reinicia a fase. Não muda o item/Pedido comercial nem cria fila/Pedido paralelos. Materiais adicionais são consumidos explicitamente pelo ledger existente, sem repetir automaticamente o consumo original da BOM.

NC crítica ou com bloqueio configurado impede a conclusão da fila enquanto aberta. O trabalho físico corretivo pode ser registrado na fase Produção; segue reinspeção e encerramento da NC, depois a conclusão da fila continua uma ação explícita da Produção. Nenhuma transição comercial/logística ocorre ao fechar NC. Bloqueio se aplica ao item/produção vinculado, ou ao Pedido inteiro quando esse for o escopo declarado.

Terceirização/retorno usam OT/Serviço canônicos e vínculos verificáveis. Qualidade não replica motores de PC, financeiro ou serviço. Devolução por recebimento exige a reversão canônica explícita do recebimento; o escopo integral dessa operação existente fica indicado, sem simular devolução parcial silenciosa.

Custo material vem do snapshot do movimento físico; mão de obra/máquina/frete/outros são fatos explícitos; referências OT/Serviço reutilizam custos canônicos, com deduplicação. Não muda preço/receita do Pedido, não paga nem cria crédito automaticamente. Ausência de custo não vira zero fictício. Relatórios documentam numeradores/denominadores e não classificam fornecedor/técnico com score.

Evidências opcionais: fotos JPG/PNG/WebP normalizadas pela pipeline já existente, bucket privado, metadados/autor, URLs curtas, reserva/finalização confiável e remoção auditada. PDF interno reutiliza marca/viewer/renderer, permite selecionar fotos e mostra remoções; custos somente a quem tem acesso financeiro.

## Gates

Migrations aditivas target-only após validação local. Sem reset/repair/include-all. Testes focados e regressão Node/pgTAP completos, concorrência, typecheck/lint/build/diff, revisão independente, Draft PR/Preview nas três larguras, teardown QA, Ready/merge, deployment correto e smoke somente leitura. Este documento será atualizado com evidências efetivas; ainda não representa PASS.

## Regras finais e validação local

- A quantidade da ação cobre toda a quantidade afetada na NC, preservando a quantidade comercial original. Exemplo validado: composto de 10 unidades, 2 afetadas, reprodução de 2; BOM e opcional selecionado dimensionados para 2, sem repetir o consumo original. Consumo adicional exige confirmação explícita.
- Retorno técnico movimenta seus materiais exclusivamente pelo motor de Serviços Externos; a NC não oferece um segundo débito para a mesma execução. Conclusão usa a prova imutável do run vinculado, mesmo se o serviço avançou para outro run.
- Cada OT é apropriada uma vez, inclusive dentro do agregado de despesas do retorno. Apuração usa custo efetivo e frete canônicos da OT. Custos anteriores sem run não são alocados arbitrariamente às novas execuções.
- Encerramento compara uma revisão opaca dos fatos canônicos, incluindo OTs transitivas, estoque, custos, retornos e fila. Mudanças exigem nova conferência. Reversão da prova física exige invalidar explicitamente a ação, preservando resultado e inspeção antigos, e produzir nova versão.
- Encerramentos congelam valores e contexto. Correções posteriores permanecem visíveis na apuração atual, sem reescrever o documento histórico. Zero declarado difere de ausência de apuração. Crédito e alteração de preço/receita não são automáticos; o indicador é custo adicional sobre valor comercial comparável, sem alegação de margem líquida/fiscal.
- Negação configurada em permissões prevalece sobre o fallback de admin nas novas fronteiras de Pedidos/Produção. Evidências são privadas, normalizadas e limitadas; o worker relê autorização e ciclo, e arquivo removido não é reativado por retry.
- Cinco suítes pgTAP novas: 142 assertivas de fluxo, segurança, OT/retorno, composição, arquivos e Financeiro. Incluem formato inválido, limite de 5 MiB, capacidade de 25 evidências e retry no limite. Regressão completa de 38 arquivos SQL aprovada numa cópia descartável reconstruída antes da fase e migrada com o SQL exato. Sem reset, repair ou DDL no banco original para esse ensaio.
- Concorrência com duas conexões: CAS/retry, disputa de saldo de estoque e criação de NC crítica versus conclusão da Produção aprovados. Regressão Node: 842 testes aprovados. Typecheck e build aprovados; lint com zero erros e os 19 avisos preexistentes. Revisão independente das correções: nenhum B/H/M/L acionável pendente nesta etapa.
- PDF sintético com análise longa, foto selecionada, reinspeção e custos históricos renderizado e inspecionado em três páginas. Documento técnico sem finanças e cancelamento sem alegação de encerramento aprovado cobertos por teste.

Resultados locais isolados não constituem o PASS final: publicação exige Preview, revisão independente, checks, teardown e smoke do deployment efetivamente publicado.

Preview identificou incompatibilidade entre min=0,000001 e step=0,01 na quantidade da ação. Correção alinha mínimo/incremento por modo; teste do HTML renderizado cobre quantidade 2 e precisão de seis casas. Regressão Node repetida: 840 PASS.

## Preview e conciliação QA

PR #61, Preview da branch `feat/phase11j-quality-rework`. Migration aplicada exclusivamente como `20261026014648_phase11j_quality_rework.sql`, alinhada à versão efetiva no Supabase; sem reset/repair/include-all. Revisão independente do código e dos ajustes sem B/H/M/L acionáveis.

Na empresa PrintFlow SaaS QA 20261023, NC-0001 foi registrada por Produção, crítica, em 2 das 10 unidades do PED-0004. Causa e responsabilidade foram registradas; reprodução iniciou a execução 2 na mesma fila. O consumo original de 21 unidades permaneceu preservado; débito adicional explícito de 4,2 levou o estoque de 9 a 4,8. Foto normalizada JPEG de 1.103 bytes foi finalizada pelo worker privado.

Produção recusou a conclusão com NC crítica aberta e exibiu a orientação de reinspeção/encerramento. Resultado físico, reinspeção aprovada e custos de 8,40 de material mais 3,00 de mão de obra produziram snapshot de 11,40. Uma única conta a pagar pendente de 3,00 foi criada explicitamente, sem pagamento. Pedido permaneceu com 10 unidades, total 500, pago 0 e estado comercial Produção. A conclusão posterior foi explícita e preservou as execuções completas de 10 e 2 unidades.

Desktop 1440×1000, tablet 768×1024 e mobile 390×844: leitura, abas, aprovação, ações e ausência de overflow horizontal conferidas. PDF real de duas páginas baixado, renderizado e verificado; ajuste impede título de materiais isolado da primeira linha. Histórico do ciclo 1 continua exportável após a reabertura. Relatórios mostraram denominadores 1/1 e 1/4 e CSV de categorias com custo 11,4 uma vez. Tabela exibe datas em Bahia e valores em BRL; CSV mantém timestamps/números originais.

Conciliação da fixture: NC cancelada no ciclo 2, obrigação cancelada, custo corrente zero, material adicional e consumo original revertidos, saldo e ledger líquido zero. Pedido sintético cancelado, produtos e conta sintéticos desativados. A única expedição derivada dessa fixture, ainda em separação e sem rastreio/envio, foi removida com o trigger padrão de auditoria; expedições QA anteriores não foram alteradas. Imagem sintética removida pelo worker, com metadata de remoção e zero objetos restantes. Encerramento aprovado de 11,40, inspeção, ações, execuções e auditoria foram preservados. Plano QA restaurado para Essencial mensal/mock, cancelado e somente leitura, revisão 36.

CibelePRINT permaneceu com 42 Pedidos, 47 registros financeiros, 2 movimentos de estoque, zero Serviços Externos/OTs/NCs. Advisors: nenhum novo FK sem índice; cinco RPCs autenticados SECURITY DEFINER e cinco tabelas privadas sem políticas são fronteiras intencionais com autorização/RLS/grants revisados, não alertas ignorados. Lint: zero erros e 19 avisos preexistentes. Node final: 842 PASS; SQL completo: 38 arquivos PASS; concorrência final: 3 cenários PASS. Cópia descartável local removida após salvar resultados. O relatório de encerramento identifica o merge, SHA de main e deployment efetivos após os gates de publicação.
