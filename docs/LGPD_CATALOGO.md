# LGPD no Catalogo Publico

Esta camada prepara o catalogo e a area do cliente para operar com registro tecnico de privacidade. Ela nao declara conformidade juridica completa automaticamente.

## Estrutura implementada

- Paginas publicas: `/store/privacidade`, `/store/cookies`, `/store/termos`, `/store/privacidade/solicitar`.
- Area autenticada: `/store/conta/privacidade`.
- Banner de cookies sem dark pattern com aceitar todos, recusar nao essenciais e gerenciar preferencias.
- Consentimentos separados para politica, termos, marketing por e-mail e marketing por WhatsApp.
- Solicitacoes LGPD publicas e autenticadas registradas em banco.
- Inventario central em `src/lib/privacy.ts`.

## Responsabilidades SaaS

- Cada loja deve revisar seus dados cadastrais, canais de privacidade, terceiros e textos legais.
- A plataforma fornece estrutura tecnica, isolamento por tenant, PWA/cache seguro e registro de consentimentos.
- A divisao juridica exata entre controlador, operador e suboperadores deve ser validada em contrato e revisao juridica.

## Bases legais

- Execucao de contrato: cadastro, pedido, entrega, atendimento, conta do cliente e status de pedido.
- Obrigacao legal/regulatoria: documentos fiscais, contabilidade, retencao minima e prevencao a fraude quando aplicavel.
- Consentimento: campanhas, newsletter, WhatsApp promocional, cookies analiticos, cookies de marketing e pixels.
- Legitimo interesse: apenas para seguranca, prevencao de abuso e operacao proporcional, com registro interno quando usado.

## Pontos para revisao juridica

- Texto final das politicas.
- Prazos de retencao por tipo de documento.
- Lista real de operadores/terceiros de cada loja.
- Procedimento de exclusao, anonimização e negativa justificada.
- Politica para criancas/adolescentes caso a loja passe a coletar esses dados.
