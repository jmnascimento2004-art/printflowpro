# Checklist de estabilidade em desenvolvimento

Use este checklist quando o ambiente local apresentar tela branca, assets do Next com 404 ou MIME incorreto, manifest quebrado ou comportamento estranho apos alteracoes de codigo.

## Antes de testar alteracoes grandes

- Pare totalmente o servidor local.
- Confirme que nao ha processo duplicado usando a porta 3000.
- Remova `.next` quando houver erro de chunk, CSS ou build antigo.
- Garanta que nenhum Service Worker antigo esteja controlando `localhost` ou `127.0.0.1`.
- Inicie novamente com `npm run dev`.
- Acesse `/manifest.webmanifest` e `/store/manifest.webmanifest` diretamente e confirme JSON com status 200.
- Confira pelo Network que arquivos de `/_next/static/` retornam JavaScript/CSS real, nunca `text/html`.

## Depois de alterar codigo

- Abra `http://127.0.0.1:3000/products`.
- Abra `http://127.0.0.1:3000/store`.
- Verifique o console do navegador.
- Verifique a aba Network se arquivos `.js` e `.css` nao estao retornando `text/html`.
- Confirme que `/_next/static/` nao retorna 404 para chunks referenciados pela pagina.

## Se aparecer tela branca

- DevTools > Application > Service Workers > Unregister.
- DevTools > Application > Storage > Clear site data.
- Feche a aba do app.
- Pare o servidor local.
- Remova `.next`.
- Inicie `npm run dev`.
- Abra novamente `http://127.0.0.1:3000/products` e `http://127.0.0.1:3000/store`.

## Regra permanente

- Service Worker nao deve ficar ativo em `development`.
- Service Worker antigo deve ser desregistrado automaticamente em `development`, inclusive nas rotas `/store`.
- Caches locais devem ser limpos em `development` para evitar chunks antigos depois de rebuild.
- Service Worker nao deve interceptar `/_next/static/`, `/_next/image`, `/_next/data`, `/api/`, manifest ou arquivos `.js`, `.css`, `.json`, `.map` e imagens.
- Manifest e icones dinamicos precisam ter fallback valido para nunca derrubar o carregamento da pagina.
