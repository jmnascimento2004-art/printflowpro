# Templates de e-mail do Supabase Auth

Este diretório guarda modelos de referência para os e-mails transacionais do catálogo PrintFlowPRO.

## Confirmação de cadastro

Arquivo:

- `confirm-signup.html`

Use este HTML no painel do Supabase:

1. Acesse o projeto no Supabase.
2. Abra `Authentication`.
3. Entre em `Emails`.
4. Selecione o template `Confirm sign up`.
5. Substitua o conteúdo HTML pelo conteúdo de `confirm-signup.html`.
6. Salve e envie um teste de cadastro.

## Variável obrigatória

Não remova esta variável:

```html
{{ .ConfirmationURL }}
```

Ela é o link gerado pelo Supabase para confirmar o e-mail do cliente. O botão principal e o link alternativo usam essa variável.

## Campos que devem ser ajustados

Antes de colar no Supabase, substitua os placeholders:

- `NOME_DA_EMPRESA`: nome público da gráfica.
- `LOGO_DA_EMPRESA`: URL pública HTTPS da logo.
- `COR_PRINCIPAL`: cor principal em hexadecimal, por exemplo `#1d2aa8`.
- `URL_DO_CATALOGO`: URL pública do catálogo, por exemplo `https://store.suaempresa.com.br/store`.

Importante: imagens em e-mails precisam ser URLs públicas HTTPS. Não use caminho local do projeto, como `/logo.png`, porque o cliente de e-mail não consegue carregar arquivos locais.

## White label dinâmico

O template do Supabase Auth é estático por padrão. Para personalizar dinamicamente por empresa/tenant, será necessária uma etapa futura usando Auth Send Email Hook, Edge Function ou serviço transacional externo.

Essa etapa futura deverá buscar a empresa correta, montar logo/cor/nome do tenant e enviar o e-mail com o template renderizado no servidor.

## Cuidados

- Não use JavaScript.
- Não use Tailwind.
- Prefira CSS inline.
- Mantenha layout simples, com largura máxima aproximada de 600px.
- Teste em desktop e mobile.
