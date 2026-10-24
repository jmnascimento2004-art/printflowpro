# Fase 11D — auditoria fiscal inicial

Estado: implementação e validação em andamento. Este documento não declara PASS.

## Base verificada

- `main` e `origin/main`: `d059e9ee28043cba32f6999e4ef919a2cb45bee6`, divergência 0/0 e stage/worktree vazios antes desta auditoria.
- Branch solicitada: `feat/phase11d-fiscal-invoicing`.
- Nenhuma migration ou configuração remota alterada nesta etapa.

## Inventário de código e schema

| Domínio | Dados canônicos existentes | Lacunas para avaliar após a escolha do documento |
| --- | --- | --- |
| Empresa | `companies`: nome, documento, contato, CEP, logradouro, número, bairro, município e UF | Razão social fiscal diferenciada, IM/IE, município IBGE, CNAE, regime e configuração do provider |
| Cliente | `customers`: documento, nome, razão social, nome fantasia, e-mail e endereço JSON; IE em `corporate_additional_info` no modelo legado | Indicador IE e município IBGE se exigidos; reaproveitar cadastro e evitar outro CPF/CNPJ/endereço |
| Produto | `products`: descrição, SKU, unidade comercial, preço e configuração comercial | Nenhum NCM/CFOP/CNAE/código de serviço fiscal encontrado; adicionar somente campos do documento escolhido |
| Pedido | `orders` e `order_items`: cliente, itens, quantidades, preço unitário, totais, frete, observações, serviços adicionais, pagamentos e origem Store | Snapshot fiscal derivado no servidor e validação de itens manuais/serviços/frete; não recalcular preço usando catálogo atual |
| Financeiro | Configuração gerencial, transações, recebíveis, impostos e relatórios existentes | Fiscal não deve criar receita, baixa, ledger ou substituir regime/impostos gerenciais |

Não existem tabelas `fiscal_*`, invoice fiscal ou certificado nos schemas `public`/`private` auditados. Ocorrências de “invoice” em Pedidos referem-se a faturamento B2B/recebíveis, sem autorização fiscal.

`settings.nfe_enabled` existe como toggle legado na tela Avançado e está falso no tenant atual. Não possui provider, emissão ou autorização associada. Não pode servir de autorização para emitir nota real. `settings.tax_rate` e `finance_settings` são gerenciais e não determinam tributação fiscal automaticamente.

## Provider e decisão necessária

Não foi encontrada integração Nuvem Fiscal, Focus NFe, PlugNotas/TecnoSpeed, eNotas, prefeitura ou SEFAZ no código/schema. A auditoria de nomes das variáveis Vercel, sem descriptografia, não encontrou configuração fiscal ou certificado. Isso não demonstra inexistência de contrato externo: a confirmação foi solicitada ao usuário.

Opções apresentadas: mock seguro de QA, expressamente permitido no escopo, ou provider contratado com homologação disponível. Nenhum foi escolhido silenciosamente. O mock não produz autorização oficial, chave fiscal, XML autorizado, DANFE ou DANFSe. Interfaces devem identificar simulação e indisponibilidade desses arquivos, caso essa opção seja confirmada.

Também foi solicitado o primeiro documento (NFS-e ou NF-e), natureza das operações e município/UF fiscal. O endereço operacional existente não comprova domicílio fiscal ou enquadramento tributário. NFC-e, CC-e e substituição não devem ser adicionadas sem necessidade e suporte comprovados.

Decisão explícita recebida do usuário: **mock seguro de QA**, **NFS-e**, **Recife/PE**. Nenhum regime ou alíquota foi informado ou presumido. A configuração permanece por tenant; Recife/PE define o primeiro escopo, sem converter o cadastro operacional existente em domicílio fiscal automaticamente.

Referências oficiais consultadas:

- [Portal Nacional da NFS-e](https://www.gov.br/nfse/pt-br): documentação técnica, ambientes e integração de serviços.
- [Portal NF-e — perguntas frequentes](https://www.nfe.fazenda.gov.br/pOrtal/perguntasFrequentes.aspx?AspxAutoDetectCookieSupport=1&tipoConteudo=4figqHYhYho%3D): homologação sem validade jurídica/fiscal.

## Limites arquiteturais já definidos pelo escopo

- Configuração fiscal separada de settings públicos; segredos e eventual certificado exclusivamente no servidor/provider.
- Produção fiscal bloqueada por guard explícito no servidor e banco; credencial ou toggle legado nunca bastam para habilitá-la.
- Relação Pedido → documentos 1:N; snapshot imutável por solicitação; sem alteração de status operacional/produção/expedição.
- Pré-validação e confirmação profissional antes do envio; navegador não fornece totais autoritativos.
- Transação, lock e idempotência no banco; chamadas externas por adapter; confirmação idempotente com estados monotônicos e histórico preservado.
- Cancelamento só conclui após aceite do adapter; prazo de QA não deve ser apresentado como prazo legal de provider real.
- Webhook quando aplicável: autenticação de mensagem, limite de tempo/replay e rejeição de eventos antigos.
- Permissões Financeiro existentes: admin, gerente e financeiro; Configurações: admin e gerente. Respeitar negações explícitas e restringir cancelamento/configuração adicionalmente.
- RLS e autorização por tenant/usuário ativo em toda leitura e comando; não depender de `user_metadata`.
- Audit Log com referência e resumo mínimo, sem payload fiscal completo ou segredo.
- Migrations somente aditivas, compatíveis e direcionadas; sem repair, include-all ou reset.

## Próximo gate

A decisão sobre documento/provider precede migrations, campos fiscais e implementação. Nenhuma emissão real foi tentada. A Fase 11D permanece em andamento.
