# Retencao de Dados

## Regra geral

Manter dados pessoais somente pelo prazo necessario para compra, entrega, atendimento, obrigacoes legais, defesa de direitos, prevencao a fraude e auditoria proporcional.

## Diretrizes por categoria

| Categoria | Retencao recomendada |
| --- | --- |
| Conta do cliente | Enquanto a conta estiver ativa ou houver relacao comercial pendente |
| Enderecos | Enquanto forem usados pelo cliente ou enquanto relacionados a pedidos em andamento |
| Pedidos e itens | Pelo prazo fiscal, contabil e de defesa de direitos definido pela loja |
| Orcamentos | Conforme politica comercial da loja e necessidade de historico |
| Consentimentos | Enquanto necessario para comprovar aceite/revogacao |
| Cookies | Pelo menor prazo tecnico possivel e conforme versao da politica |
| Solicitacoes LGPD | Enquanto necessario para comprovar atendimento e defesa de direitos |
| Logs de seguranca | Prazo reduzido e proporcional ao risco |

## Exclusao e anonimização

- A exclusao de conta deve gerar solicitacao em `data_subject_requests`.
- Pedidos emitidos, notas fiscais e registros contabeis nao devem ser apagados automaticamente.
- Dados nao obrigatorios devem ser excluidos ou anonimizados quando nao houver finalidade remanescente.
- Antes de qualquer exclusao definitiva, confirmar identidade do solicitante por canal seguro.
