# PrintFlowPRO - Revisao Global de UI/UX e Design System

## Escopo

Esta revisao nao altera funcionalidades, regras de negocio, Supabase, banco de dados, migrations, pedidos, checkout, financeiro ou fluxos operacionais.

## Componentes Padronizados

- Fonte global: Inter como familia principal do sistema.
- Tokens globais de UI: azul institucional, radius de 10px, altura de controle de 44px e escala de espacamento 4/8/12/16/24/32px.
- Tipografia base: H1 32px, H2 24px, H3 20px, cards 16px, texto padrao 14px, texto auxiliar 13px e texto pequeno 12px.
- Placeholders: cor `#94A3B8`, peso 400 e tamanho base de 13px.
- Inputs, selects e textareas: altura minima de 44px, radius 10px, fonte Inter e foco consistente.
- Classes compartilhadas: `pf-card`, `pf-card-compact`, `pf-input`, `pf-textarea`, `pf-button-primary`, `pf-button-secondary`, `pf-button-danger`, `pf-card-title` e `pf-helper-text`.
- Campos da area do cliente/catalogo: `StoreFormFields` agora usa os tokens globais.
- Servicos adicionais de orcamentos/pedidos: inputs e botoes alinhados ao padrao de 44px e radius 10px.

## Telas Revisadas

- Base global do app via `src/app/globals.css`.
- Configuracao visual do Tailwind via `tailwind.config.ts`.
- Area do Cliente e catalogo em campos compartilhados via `src/components/store/StoreFormFields.tsx`.
- Fluxos comerciais com servicos adicionais via `src/components/commercial/AdditionalServicesSection.tsx`.

## Fontes Substituidas

- O sistema ja carregava Inter em `globals.css`.
- A revisao consolidou Inter como `fontFamily.sans` no Tailwind e como variavel global `--pf-font-sans`.
- Nao foram encontradas outras fontes conflitantes em componentes TSX, exceto fontes embutidas em SVG gerado dinamicamente para icone de branding, que nao afeta a UI da aplicacao.

## Inconsistencias Encontradas

- Muitas telas ainda usam classes Tailwind locais muito especificas, como `text-3xl`, `font-black`, `rounded-2xl`, `h-9`, `h-10` e sombras customizadas.
- O catalogo publico possui componentes grandes com estilos inline/locais, principalmente cards de produto, beneficios, footer, carrinho e modais.
- Algumas telas da area do cliente e dashboard ainda usam texto com encoding legado em partes do conteudo.
- Warnings existentes de lint continuam relacionados principalmente a `<img>` e dependencias de hooks em arquivos antigos.

## Itens Para Revisao Manual Posterior

- Migrar gradualmente cards e botoes antigos para `pf-card` e `pf-button-*`.
- Revisar manualmente telas grandes: catalogo publico, configurador de produto, carrinho, dashboard admin, produtos, orcamentos, pedidos e financeiro.
- Padronizar componentes de modal em um componente comum.
- Revisar textos com encoding legado antes de uma revisao fina de copywriting.
- Validar visualmente em desktop, tablet e mobile apos deploy, com foco em tabelas e telas densas do admin.
