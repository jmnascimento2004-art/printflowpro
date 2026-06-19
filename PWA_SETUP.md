# PWA Setup - PrintFlowPRO

## Arquivos criados

- `public/manifest.webmanifest`: manifesto do aplicativo instalavel.
- `src/app/api/pwa/manifest/route.ts`: manifesto dinamico com nome, descricao e icones da empresa ativa.
- `src/app/api/pwa/icon/route.ts`: geracao segura de icones PWA a partir da logo/favIcon da empresa.
- `public/icons/`: icones PNG do app nos tamanhos 72, 96, 128, 144, 152, 192, 384 e 512.
- `public/sw.js`: service worker com cache seguro para assets estaticos e fallback offline.
- `src/app/offline/page.tsx`: tela amigavel para uso sem conexao.
- `src/lib/pwa.ts`: utilitarios de deteccao de PWA, iOS e Safari.
- `src/lib/branding/resolveBranding.ts`: resolucao central da identidade visual ativa.
- `src/components/branding-head-sync.tsx`: sincronizacao do manifest, meta tags e icones com a empresa ativa.
- `src/components/install-app-button.tsx`: botao reutilizavel de instalacao e modal de orientacao para iPhone/iPad.

## Arquivos alterados

- `src/app/layout.tsx`: metadados PWA, manifest, viewport e registro global do service worker.
- `src/components/pwa-register.tsx`: registro do service worker, splash leve e aviso de nova versao.
- `src/components/dashboard/header.tsx`: botao discreto de instalacao no menu do perfil.

## Como testar localmente

1. Rode `npm run build`.
2. Rode `npm run start`.
3. Abra `http://127.0.0.1:3000` no Chrome ou Edge.
4. Acesse DevTools > Application e confira:
   - Manifest carregado;
   - Service Worker registrado;
   - Cache `printflowpro-static-*` criado;
   - Offline page acessivel em `/offline`.

Service workers exigem HTTPS em producao. Em desenvolvimento, `localhost` e `127.0.0.1` sao permitidos pelos navegadores.

## Como testar instalacao no computador

1. Abra o sistema no Chrome ou Edge.
2. Entre no ERP.
3. Aguarde a empresa ativa carregar. O manifest dinamico passa a usar nome, descricao, favicon/logo e cor da empresa.
4. Abra o menu do perfil no canto superior direito.
5. Clique em `Instalar aplicativo`.
6. Confirme o prompt nativo do navegador.

Depois de instalado, o app deve abrir em modo standalone.

Quando nenhuma empresa real estiver configurada, o app usa o fallback `PrintFlowPRO`.

## Como instalar no Android

1. Abra o dominio do PrintFlowPRO no Chrome para Android.
2. Entre no ERP.
3. Toque no menu do perfil e escolha `Instalar aplicativo`, quando disponivel.
4. Confirme a instalacao.

Se o navegador preferir, tambem pode aparecer a opcao nativa `Adicionar a tela inicial` no menu do Chrome.

## Como instalar no iPhone/iPad

1. Abra o sistema no Safari.
2. Entre no ERP.
3. Toque no menu do perfil e em `Instalar aplicativo`.
4. Siga a orientacao exibida: toque em Compartilhar e depois em `Adicionar a Tela de Inicio`.

O iOS nao usa o prompt `beforeinstallprompt`; por isso a instalacao passa pelo menu de compartilhamento do Safari.

## Como validar o service worker

1. DevTools > Application > Service Workers.
2. Confirme que `/sw.js` esta ativo.
3. Marque `Offline` em DevTools > Network.
4. Recarregue uma rota navegavel e confirme o fallback `/offline`.
5. Desmarque `Offline` e clique em `Tentar novamente`.

## Como limpar cache

No navegador:

1. DevTools > Application.
2. Clique em `Clear storage`.
3. Marque caches, service workers e storage desejado.
4. Clique em `Clear site data`.

Ou em Application > Service Workers, use `Unregister` e recarregue a pagina.

## Publicacao na Vercel

1. Faça commit e push normalmente.
2. Aguarde o deploy da Vercel.
3. Teste em HTTPS no dominio principal.
4. Verifique Manifest e Service Worker no DevTools.

## Como atualizar icones futuramente

Substitua os arquivos em `public/icons/` mantendo os mesmos nomes e tamanhos.
Atualize tambem `public/printflowpro-mark.svg` se a marca base mudar.

## Limites do modo offline

O modo offline nao disponibiliza dados privados do ERP. Por seguranca, o service worker nao cacheia:

- Supabase;
- APIs internas;
- tokens e sessoes;
- dados de clientes;
- dados financeiros;
- pedidos;
- estoque;
- usuarios.

Sem internet, o app mostra a pagina offline e mantem apenas assets estaticos ja cacheados, como icones, CSS, JavaScript e imagens publicas.
