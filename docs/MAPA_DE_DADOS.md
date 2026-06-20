# Mapa de Dados do Catalogo Publico

Este inventario descreve o tratamento atual de dados pessoais no catalogo publico e na area do cliente final. Ele e tecnico e deve ser revisado pela loja e por profissional juridico antes da publicacao definitiva.

## Dados identificados

| Categoria | Dados | Finalidade | Base legal | Armazenamento | Acesso | Retencao | Compartilhamento |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Identificacao | Nome, razao social, nome fantasia, CPF/CNPJ | Cadastro, orcamento, pedido, atendimento e fiscal | Execucao de contrato; obrigacao legal | `customers`, `store_customer_accounts`, `quotes`, `orders` | Loja, cliente autenticado, plataforma | Relacao comercial e prazos legais | Fiscal, pagamento, entrega e suporte quando configurados |
| Contato | E-mail, telefone, WhatsApp | Login, recuperacao de conta, status de pedido, suporte e marketing opcional | Contrato; consentimento para marketing | Supabase Auth, `customers`, `customer_consents` | Loja, cliente, plataforma | Conta ativa e necessidade legal/comercial | E-mail, WhatsApp e atendimento configurados |
| Endereco | CEP, rua, numero, bairro, cidade, UF, referencia | Entrega, retirada e suporte | Execucao de contrato | `customer_addresses`, `quotes`, `orders` | Loja, cliente autenticado, operadores logisticos | Pedido, garantia, suporte e prazos legais | Transportadora/motoboy/retirada configurados |
| Historico comercial | Pedidos, itens, orcamentos, carrinho, dados de entrega | Compra, acompanhamento, suporte e gestao operacional | Contrato; obrigacao legal; defesa de direitos | `quotes`, `quote_items`, `orders`, `order_items` | Loja e cliente autenticado apenas nos proprios registros | Fiscal, contabile comercial | Pagamento, entrega e atendimento |
| Pagamento | Metodo, valor, status, referencia de transacao | Confirmar e conciliar pagamento | Contrato; obrigacao legal | Somente referencias internas quando houver gateway | Loja e operadores financeiros | Fiscal/contabil/antifraude | Gateway configurado |
| Tecnicos | Auth Supabase, cookies, identificador anonimo, localStorage, PWA cache, logs tecnicos | Login, seguranca, carrinho, preferencias e prevencao de abuso | Contrato; legitimo interesse documentado; consentimento | Supabase Auth, `cookie_preferences`, `privacy_audit_events`, navegador | Plataforma e loja quando necessario | Minimo necessario | Hospedagem, banco/auth e ferramentas configuradas |

## Dados que nao devem ser coletados

- Numero completo de cartao.
- CVV.
- Senha de cartao.
- Copias de documentos sem finalidade definida.
- Dados sensiveis que nao sejam indispensaveis.
- Data de nascimento sem finalidade clara.

## Observacoes

- Marketing nao e requisito para cadastro, compra ou checkout.
- Cookies analiticos e de marketing dependem de consentimento separado.
- O cliente autenticado so deve acessar dados vinculados ao proprio `customer_id` e `company_id`.
