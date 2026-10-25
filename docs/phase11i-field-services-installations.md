# Fase 11I auditoria e arquitetura

Base real confirmada: `129ca5f33389c86b6f17f8675feea96409a733ec`, após fast-forward limpo de `7af5d30`; divergência 0/0 antes de criar `feat/phase11i-field-services-installations`. A correção de login/marca do PR 57 permanece preservada.

Agenda já agrega compromissos manuais recorrentes e origens Pedido, Produção, Expedição e Financeiro em `loadAgenda`. Serviços de campo serão mais uma origem desse read-model, usando o intervalo real e responsável, sem inserir compromisso manual duplicado. Status e reagendamento pertencem ao serviço; ações da Agenda abrem a origem.

Pedidos têm cliente canônico, itens, endereço de entrega textual e prazo; clientes têm endereço estruturado. O serviço exige Pedido e deriva cliente no servidor. Endereço estruturado e checklist ficam preservados por execução. Instalação/entrega técnica exigem produção vinculada pronta para iniciar; visita/medição podem anteceder a produção. Entrega logística continua em `shipments`, sem acoplamento de status.

Equipe usa profiles ativos com usuário Auth e permissão operacional. Gestão, execução atribuída, reabertura e Financeiro têm permissões distintas. Tokens nunca aceitam company_id como autoridade. Notificações internas derivam dos eventos do serviço direcionados aos participantes, no cabeçalho existente.

Materiais adicionais usam `private.move_inventory`, compartilhado com Estoque/Fase 11H. Levar baixa uma vez; consumir aloca a quantidade já levada; sobra retorna por movimento explícito. Concluir exige conciliação levado=consumido+retornado. Materiais já consumidos na composição aparecem separadamente como referência; não são baixados outra vez. Não há estoque de veículo/equipe.

Custos são fatos operacionais; não alteram preço/receita do Pedido. Só acesso financeiro gera uma conta a pagar explícita por despesa, pela `finance_command`. Terceiro pode vincular OT/fornecedor 11H e seguir seu PC, impedindo obrigação duplicada. Pagamento permanece no Financeiro.

Fotos e assinatura usam bucket privado, limites de bytes/pixels, normalização por Sharp e URLs assinadas curtas. Reserva de upload, commit confiável e metadata versionada evitam registrar arquivo inexistente ou anexar a uma execução já concluída. Sem imagem/base64 em Audit Log. Aceite é opcional, com nome, consentimento e documento opcional; assinatura simples não é ICP-Brasil.

Conclusão preserva snapshot imutável por rodada. Reabrir é restrito, exige motivo e cria nova rodada sem apagar a anterior. PDF técnico compartilha renderer, marca e viewer atuais, sem preços por padrão. Remoção controlada de evidências preserva tombstone/auditoria e torna remoção visível no histórico.

Validação e publicação: migrations aditivas target-only após testes locais; Node/pgTAP completos, concorrência, typecheck/lint/build/diff; revisão independente; Draft PR, Preview nas três larguras e execução mobile; encerramento QA, Ready/merge e smoke somente leitura. Fase 11J fora do escopo. Este registro será atualizado com os resultados efetivos.

Gates locais concluídos: Node 833/833; 33 arquivos pgTAP, incluindo 26 contratos e 89 testes de segurança da fase; 6 cenários de migration/concorrência em clone descartável; typecheck; lint sem erros (19 avisos preexistentes); build; diff check. PDF sintético de três páginas renderizado por Poppler e inspecionado, incluindo foto, assinatura, texto longo e tombstone. Revisão independente somente leitura encerrou com 0 B/H/M/L acionáveis.

Migrations remotas aplicadas exclusivamente no projeto dyqqhhywiubjraxyebgr: 20261025211720 (schema) e 20261025211817 (índice FK do responsável). Sete tabelas públicas com RLS e bucket privado confirmados. Advisor de FK identificou o índice complementar e foi atendido. Tabelas privadas de nonce/contador usam RLS sem policies e privilégios revogados; as três RPCs authenticated SECURITY DEFINER possuem autorização, tenant e gates canônicos explícitos. Nenhuma operação comercial criada na CibelePRINT; Preview e smoke de Production ainda pendentes nesta revisão.

Preview PR #60 aprovado em 1440×900, 820×1180 e 390×844, sem overflow horizontal da página. Base atualizada com merge sem conflito de origin/main 6bbb526 (PRs 58/59 de login/cadastro), preservando essas mudanças. Commit funcional 4ad6f55, integração da base 06056fc e ajuste de paginação PDF 27e646d (título de evidências junto ao conteúdo). Teste PDF e typecheck repetidos após o ajuste; Preview desse SHA READY e revisão independente confirmou 0 B/H/M/L acionáveis.

QA autenticado pela interface: orçamento #1003 → PED-0003; SE-0001 medição antes da Produção pronta; agendamento/reagendamento com janela inválida rejeitada; checklist/modelo e conclusão incompleta rejeitada; deslocamento/chegada/início/impedimento/retomada/km; foto e assinatura sintéticas com consentimento e autoria; conclusão e reabertura com snapshot anterior preservado. Estoque 5→2 (levado 3)→3 (retorno 1, consumo 2)→5 (reversão líquida). Custos: obrigação explícita R$8, cancelamento, correção R$12, nova obrigação, cancelamento e fato zerado, preservando dois vínculos históricos. Nenhum pagamento.

SE-0002 instalação: saída bloqueada com item na fila, liberada após concluir somente a Produção sintética. Agenda sinalizou conflito das duas janelas da mesma equipe; reagendamento retirou a sobreposição. O serviço não altera status comercial nem entrega. Conferidos links no Pedido, Produção e Cliente, avisos internos, revisão de WhatsApp cancelada sem envio, seis modos de relatório e download CSV. Plano ativo Essencial sem reports ocultou o relatório; operação e histórico continuaram acessíveis.

PDF real de duas páginas baixado, renderizado por Poppler e inspecionado (dados, checklist, materiais, foto, assinatura e consentimento). Impressão acionada, usuário informou cancelamento do diálogo nativo. Viewer validado também após remoção das imagens, com tombstones e histórico preservados.

Teardown QA: dois serviços cancelados, uma conclusão histórica preservada, Pedido cancelado/recebido zero, expedição sintética canônica encerrada e identificada SIMULADO-QA-11I, estoque inicial revertido por ajuste, saldo e ledger líquido zero, custos zero, nenhuma obrigação atual, duas obrigações históricas canceladas, evidências removidas e bucket com zero objetos, zero compromissos manuais/serviços pendentes. Conta interna QA restaurada inativa/saldo zero. Material QA mantido interno fora do catálogo, saldo zero, para preservar ledger/FKs. Modelo QA e registros de auditoria preservados. Assinatura restaurada a cancelled / qa-essential / monthly / cancel_at_period_end=true, somente leitura.

Conferência real CibelePRINT ao fim do QA: 42 Pedidos, 47 registros financeiros, 2 movimentos de estoque, 0 OTs e 0 serviços externos — mesmas contagens do baseline. Sem cobrança, mensagem, equipe ou operação real. Merge e smoke publicado ainda aguardam o gate final.
