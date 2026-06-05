const CACHE_NAME = 'printflowpro-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/icon.png',
  '/favicon.ico'
];

// Instalação: Pré-cacheia arquivos iniciais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Ativação: Limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptador de requisições (Fetch)
self.addEventListener('fetch', (event) => {
  // Ignora requisições que não sejam GET ou sejam para fora da origem (como extensões)
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Ignora requisições de desenvolvimento do Next.js (HMR), chamadas de API ou arquivos temporários
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith('/_next/') || 
    url.pathname.startsWith('/api/') || 
    url.pathname.includes('webpack')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((response) => {
        // Se a resposta for inválida ou não for do mesmo domínio, não faz cache
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        // Em caso de falha de conexão (offline), tenta servir o index ou o recurso do cache
        return caches.match('/');
      });
    })
  );
});
