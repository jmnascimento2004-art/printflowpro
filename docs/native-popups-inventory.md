# Inventário de popups nativos

Auditoria inicial da macroetapa em main3652bc9, com Pedidos já em refinamento na branch. 87 ocorrências remanescentes fora de Pedidos; ocorrências iniciais de Pedidos constam no diff do primeiro PR. Classificação A: confirmação; B: aviso/sucesso; C: erro/validação; D: entrada; E: destrutiva. Nenhum uso debug encontrado.

| Arquivo:linha | API | Classe | Conteúdo |
|---|---|---|---|
| src/app/(dashboard)/crm/page.tsx:262 | alert | C — erro/validação | 'Este cliente possui pedidos ou orçamentos vinculados. Para preservar o histórico comercial, ele não será excluído. Use Bloquear se precisar impedir novos atendimentos.' |
| src/app/(dashboard)/crm/page.tsx:266 | confirm | E — destrutiva | 'Tem certeza de que deseja excluir este cliente? Esta ação não poderá ser desfeita.' |
| src/app/(dashboard)/crm/page.tsx:380 | alert | C — erro/validação | 'CPF invalido. Verifique os digitos e tente novamente.' |
| src/app/(dashboard)/crm/page.tsx:385 | alert | C — erro/validação | 'Informe o CNPJ da empresa.' |
| src/app/(dashboard)/crm/page.tsx:390 | alert | C — erro/validação | 'CNPJ invalido. Verifique os digitos e tente novamente.' |
| src/app/(dashboard)/crm/page.tsx:396 | alert | C — erro/validação | 'CEP invalido. O CEP deve conter exatamente 8 digitos.' |
| src/app/(dashboard)/crm/page.tsx:406 | alert | C — erro/validação | 'Ja existe um cliente cadastrado com este CPF/CNPJ.' |
| src/app/(dashboard)/crm/page.tsx:951 | confirm | E — destrutiva | `Excluir o cliente ${selectedCustomer.name}?` |
| src/app/(dashboard)/crm/page.tsx:1053 | confirm | E — destrutiva | `Excluir o cliente ${selectedCustomer.name}?` |
| src/app/(dashboard)/pos/page.tsx:144 | alert | C — erro/validação | error instanceof Error ? error.message : 'Produto indisponível.' |
| src/app/(dashboard)/pos/page.tsx:157 | alert | C — erro/validação | error instanceof Error ? error.message : 'Configuração indisponível.' |
| src/app/(dashboard)/pos/page.tsx:163 | alert | C — erro/validação | 'Produto não está mais disponível.' |
| src/app/(dashboard)/pos/page.tsx:167 | alert | C — erro/validação | error instanceof Error ? error.message : 'Quantidade indisponível.' |
| src/app/(dashboard)/pos/page.tsx:181 | alert | C — erro/validação | 'Venda Faturada (Crédito) não pode ser registrada para Consumidor Final!' |
| src/app/(dashboard)/pos/page.tsx:185 | alert | C — erro/validação | 'Este cliente não está habilitado para faturamento corporativo!' |
| src/app/(dashboard)/pos/page.tsx:189 | alert | C — erro/validação | 'O crédito corporativo deste cliente não está Aprovado!' |
| src/app/(dashboard)/pos/page.tsx:194 | alert | C — erro/validação | `Crédito Insuficiente! Limite disponível: ${formatCurrency(available)}` |
| src/app/(dashboard)/pos/page.tsx:234 | alert | C — erro/validação | 'Documento CNPJ inválido! Verifique os dígitos e tente novamente.' |
| src/app/(dashboard)/pricing/page.tsx:298 | alert | C — erro/validação | 'Por favor, informe o nome do produto.' |
| src/app/(dashboard)/production/page.tsx:73 | alert | C — erro/validação | error instanceof Error ? error.message : 'Não foi possível preparar a atualização no WhatsApp.' |
| src/app/(dashboard)/production/page.tsx:77 | alert | C — erro/validação | 'Este modelo está inativo na Central de WhatsApp.' |
| src/app/(dashboard)/production/page.tsx:80 | confirm | A — confirmação | 'Abrir o WhatsApp com a atualização de produção preparada?' |
| src/app/(dashboard)/production/page.tsx:84 | alert | C — erro/validação | "Cliente sem telefone válido para WhatsApp." |
| src/app/(dashboard)/products/page.tsx:844 | alert | C — erro/validação | 'Informe material, tamanho, cores e acabamento para a combinação.' |
| src/app/(dashboard)/products/page.tsx:848 | alert | C — erro/validação | 'A quantidade da faixa deve ser maior que zero.' |
| src/app/(dashboard)/products/page.tsx:852 | alert | C — erro/validação | 'Informe um preço unitário maior que zero.' |
| src/app/(dashboard)/products/page.tsx:864 | alert | C — erro/validação | 'Já existe uma faixa com esta quantidade para esta combinação.' |
| src/app/(dashboard)/products/page.tsx:1073 | alert | C — erro/validação | 'Informe material, tamanho, cores e acabamento para a combinação.' |
| src/app/(dashboard)/products/page.tsx:1086 | alert | C — erro/validação | 'Já existe uma combinação com este material, tamanho, cores e acabamento.' |
| src/app/(dashboard)/products/page.tsx:1095 | alert | C — erro/validação | 'Revise as faixas: a quantidade deve ser maior que zero e os valores não podem ser negativos.' |
| src/app/(dashboard)/products/page.tsx:1101 | alert | C — erro/validação | 'Existem faixas duplicadas com a mesma quantidade.' |
| src/app/(dashboard)/products/page.tsx:1158 | alert | C — erro/validação | limitValidation.message |
| src/app/(dashboard)/products/page.tsx:1165 | alert | C — erro/validação | invalidValidation.message |
| src/app/(dashboard)/products/page.tsx:1193 | alert | C — erro/validação | message |
| src/app/(dashboard)/products/page.tsx:1215 | alert | C — erro/validação | "A quantidade mínima deve ser pelo menos 1." |
| src/app/(dashboard)/products/page.tsx:1219 | alert | C — erro/validação | "O preço deve ser maior que zero." |
| src/app/(dashboard)/products/page.tsx:1223 | alert | C — erro/validação | "Já existe uma faixa configurada para esta quantidade mínima." |
| src/app/(dashboard)/products/page.tsx:1243 | alert | C — erro/validação | 'Esta variacao ja foi adicionada.' |
| src/app/(dashboard)/products/page.tsx:1254 | alert | C — erro/validação | 'Esta cor ja foi adicionada.' |
| src/app/(dashboard)/products/page.tsx:1309 | alert | C — erro/validação | 'Este tamanho ja foi adicionado.' |
| src/app/(dashboard)/products/page.tsx:1590 | alert | C — erro/validação | error instanceof Error ? error.message : 'Não foi possível duplicar.' |
| src/app/(dashboard)/products/page.tsx:1600 | alert | C — erro/validação | costErrors.join(' ') |
| src/app/(dashboard)/products/page.tsx:1608 | alert | C — erro/validação | 'Adicione pelo menos uma opção de quantidade ou uma combinação na Matriz Inteligente para produtos vendidos por quantidade/lote.' |
| src/app/(dashboard)/products/page.tsx:2260 | confirm | E — destrutiva | `Excluir o produto "${prod.name}" do catálogo do ERP?` |
| src/app/(dashboard)/products/page.tsx:2304 | confirm | E — destrutiva | `Excluir o produto "${prod.name}" do catálogo do ERP?` |
| src/app/(dashboard)/products/page.tsx:2464 | alert | C — erro/validação | `Não é possível excluir a categoria "${parent.name}" porque ela possui ${count} produto(s) associado(s).` |
| src/app/(dashboard)/products/page.tsx:2467 | confirm | E — destrutiva | `Deseja realmente excluir a categoria "${parent.name}"?` |
| src/app/(dashboard)/products/page.tsx:2526 | alert | C — erro/validação | `Não é possível excluir a categoria "${child.name}" porque ela possui ${count} produto(s) associado(s).` |
| src/app/(dashboard)/products/page.tsx:2529 | confirm | E — destrutiva | `Deseja realmente excluir a categoria "${child.name}"?` |
| src/app/(dashboard)/products/page.tsx:2590 | alert | C — erro/validação | `Não é possível excluir a categoria "${child.name}" porque ela possui ${count} produto(s) associado(s).` |
| src/app/(dashboard)/products/page.tsx:2593 | confirm | E — destrutiva | `Deseja realmente excluir a categoria "${child.name}"?` |
| src/app/(dashboard)/quotes/page.tsx:178 | confirm | E — destrutiva | 'Excluir este orçamento?' |
| src/app/(dashboard)/quotes/page.tsx:184 | alert | C — erro/validação | getPersistenceErrorMessage(error) |
| src/app/(dashboard)/quotes/page.tsx:267 | alert | C — erro/validação | 'Este orçamento já foi convertido em pedido e não pode mais ser editado. Faça os ajustes no pedido correspondente.' |
| src/app/(dashboard)/quotes/page.tsx:317 | alert | C — erro/validação | getPersistenceErrorMessage(error) |
| src/app/(dashboard)/quotes/page.tsx:326 | alert | C — erro/validação | 'Não foi possível abrir o PDF. Verifique se o navegador bloqueou a nova guia.' |
| src/app/(dashboard)/quotes/page.tsx:331 | alert | C — erro/validação | 'Este modelo está inativo na Central de WhatsApp.' |
| src/app/(dashboard)/quotes/page.tsx:334 | confirm | A — confirmação | 'Abrir o WhatsApp com a proposta preparada?' |
| src/app/(dashboard)/quotes/page.tsx:340 | alert | C — erro/validação | 'Não foi possível abrir o WhatsApp. Verifique o telefone do cliente.' |
| src/app/(dashboard)/quotes/page.tsx:343 | alert | B — aviso/sucesso | 'O WhatsApp foi aberto com a mensagem pronta. Anexe manualmente o PDF gerado/impresso do orçamento na conversa.' |
| src/app/(dashboard)/quotes/page.tsx:751 | alert | C — erro/validação | 'Informe a descrição do item avulso/manual.' |
| src/app/(dashboard)/quotes/page.tsx:756 | alert | C — erro/validação | 'Informe o preço unitário do item avulso/manual.' |
| src/app/(dashboard)/quotes/page.tsx:761 | alert | C — erro/validação | 'Informe largura e altura maiores que zero para o item por metro quadrado.' |
| src/app/(dashboard)/quotes/page.tsx:766 | alert | C — erro/validação | 'Informe o comprimento em centímetros para o item por metro linear.' |
| src/app/(dashboard)/quotes/page.tsx:823 | alert | C — erro/validação | 'Informe medidas em metros maiores que zero.' |
| src/app/(dashboard)/quotes/page.tsx:828 | alert | C — erro/validação | customFields.errors.join(' ') |
| src/app/(dashboard)/quotes/page.tsx:865 | alert | C — erro/validação | priceResolution.warningMessage \|\| 'Complete a configuração do produto antes de adicionar.' |
| src/app/(dashboard)/quotes/page.tsx:1016 | alert | C — erro/validação | 'Por favor, selecione o cliente.' |
| src/app/(dashboard)/quotes/page.tsx:1020 | alert | C — erro/validação | 'Adicione pelo menos um item ao orçamento.' |
| src/app/(dashboard)/quotes/page.tsx:1083 | alert | B — aviso/sucesso | successMessage |
| src/app/(dashboard)/quotes/page.tsx:1090 | alert | C — erro/validação | getPersistenceErrorMessage(error) |
| src/app/(dashboard)/quotes/page.tsx:1117 | alert | C — erro/validação | 'Não foi possível baixar o PDF. Tente novamente.' |
| src/app/(dashboard)/quotes/page.tsx:1510 | confirm | A — confirmação | 'Aprovar este orçamento e gerar o Pedido?' |
| src/app/(dashboard)/quotes/page.tsx:1618 | confirm | A — confirmação | 'Aprovar este orçamento e gerar o Pedido?' |
| src/app/(dashboard)/settings/page.tsx:386 | alert | C — erro/validação | 'Nome e E-mail são obrigatórios!' |
| src/app/(dashboard)/settings/page.tsx:474 | confirm | E — destrutiva | `Tem certeza que deseja excluir o funcionário "${name}"?` |
| src/app/(dashboard)/settings/page.tsx:566 | confirm | E — destrutiva | 'Tem certeza que deseja remover este ponto de coleta?' |
| src/app/(dashboard)/settings/page.tsx:579 | alert | C — erro/validação | 'CNPJ inválido! Verifique o número digitado.' |
| src/app/(dashboard)/settings/page.tsx:586 | alert | C — erro/validação | 'CEP inválido! Verifique o número de CEP.' |
| src/app/(dashboard)/settings/page.tsx:2092 | confirm | E — destrutiva | 'Deseja realmente apagar todos os registros do sistema (clientes, produtos, categorias, orçamentos, pedidos, etc.)? Isso deixará a sua plataforma vazia para uso real. Esta ação não poderá ser desfeita.' |
| src/app/store/page.tsx:651 | alert | C — erro/validação | 'As solicitações por WhatsApp estão temporariamente indisponíveis.' |
| src/app/store/page.tsx:659 | alert | C — erro/validação | error instanceof Error ? error.message : 'Não foi possível preparar a mensagem agora.' |
| src/app/store/page.tsx:692 | alert | C — erro/validação | 'Preencha o endereço completo para entrega por motoboy.' |
| src/app/store/page.tsx:799 | alert | C — erro/validação | getPersistenceErrorMessage(error) |
| src/components/catalog/catalog-banner-manager.tsx:288 | confirm | E — destrutiva | `Excluir o banner “${banner.title \|\| 'Sem título'}”?` |
| src/components/pdf/pdf-preview-viewer.tsx:224 | alert | C — erro/validação | 'Não foi possível abrir o PDF. Verifique se o navegador bloqueou a nova guia.' |
| src/components/rich-text-editor.tsx:280 | prompt | D — entrada de dado | 'Informe a URL do link' |

## Exceções técnicas

- beforeunload em WhatsApp: proteção de edição ao fechar/recarregar aba. Preservar; navegação interna usa dialog.
- deferredPrompt.prompt() em PWAInstallProvider é a API de instalação controlada pelo navegador, não window.prompt nem entrada de texto. Preservar o recurso.
- Diálogo de impressão explícito é comportamento solicitado, não alert/confirm/prompt de UX.

## Plano de entrega

PR1: área de ciência, popups de Pedidos e primitive global. PR2 imediatamente seguinte: substituição global dos locais inventariados, formulário de link do editor, toast compartilhado, confirmações assíncronas e teste de bloqueio por AST. Nenhuma mudança de schema ou regras de negócio.
