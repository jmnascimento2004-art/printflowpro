# Cookies e Consentimentos

## Categorias

- Necessarios: login, autenticacao, seguranca, carrinho, checkout, PWA e preferencias tecnicas essenciais.
- Preferencias: idioma, tema e navegacao nao essencial.
- Analiticos: metricas e desempenho, somente com consentimento e ferramenta configurada.
- Marketing: pixels, remarketing e anuncios personalizados, somente com consentimento.

## Implementacao

- Biblioteca central: `src/lib/privacy.ts`.
- Contexto: `src/context/store-privacy-context.tsx`.
- Banner: `src/components/store/StoreCookieBanner.tsx`.
- Registros: `cookie_preferences` e `customer_consents`.

## Regras

- Recusar nao essenciais deve ter destaque equivalente ao aceite.
- Nenhum checkbox opcional vem pre-marcado.
- Marketing e aceite de politica nao sao a mesma coisa.
- Consentimento pode ser alterado em `/store/privacidade#cookies` ou `/store/conta/privacidade`.
- Identificador anonimo deve ser pseudonimo e nao deve guardar IP completo.

## Scripts de terceiros identificados

No codigo atual nao foram encontrados carregamentos diretos de Google Analytics, Meta Pixel ou tags de marketing no catalogo. Caso sejam adicionados, devem depender da categoria correspondente antes de carregar.
