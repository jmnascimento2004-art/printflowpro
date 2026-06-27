const VERSION = '2026-06-20-store-privacy-01';
const STATIC_CACHE = `printflowpro-store-static-${VERSION}`;
const IMAGE_CACHE = `printflowpro-store-images-${VERSION}`;
const BRANDING_CACHE = `printflowpro-store-branding-${VERSION}`;
const OFFLINE_URL = '/store/offline';

const STATIC_ASSETS = [
  OFFLINE_URL
];

function isNextAssetRequest(request) {
  const url = new URL(request.url);
  return url.origin === self.location.origin && url.pathname.startsWith('/_next/');
}

function isNonHtmlAssetRequest(request) {
  const url = new URL(request.url);
  return (
    url.origin === self.location.origin &&
    /\.(?:js|css|map|json|webmanifest|png|jpe?g|svg|webp|ico|woff2?|ttf|otf)$/i.test(url.pathname)
  );
}

function isSupabaseRequest(url) {
  return url.hostname.includes('supabase.co') || url.hostname.includes('supabase.in');
}

function isPrivateOrDynamicRequest(request) {
  const url = new URL(request.url);
  return (
    request.method !== 'GET' ||
    request.headers.has('authorization') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/store/conta') ||
    url.pathname.startsWith('/store/login') ||
    url.pathname.startsWith('/store/cadastro') ||
    url.pathname.startsWith('/store/redefinir-senha') ||
    url.pathname.startsWith('/store/recuperar-senha') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/auth/v1/') ||
    isSupabaseRequest(url)
  );
}

function isManifestRequest(request) {
  const url = new URL(request.url);
  return (
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    (
      url.pathname === '/store/manifest.webmanifest' ||
      url.pathname === '/favicon.ico'
    )
  );
}

function isStaticAssetRequest(request) {
  const url = new URL(request.url);
  return (
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    url.pathname.startsWith('/icons/') &&
    ['image', 'font'].includes(request.destination)
  );
}

function isPublicImageRequest(request) {
  const url = new URL(request.url);
  return request.method === 'GET' && !isSupabaseRequest(url) && request.destination === 'image';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('printflowpro-store-') && ![STATIC_CACHE, IMAGE_CACHE, BRANDING_CACHE].includes(cacheName))
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (
    isNextAssetRequest(request) ||
    isNonHtmlAssetRequest(request) ||
    isManifestRequest(request) ||
    isPrivateOrDynamicRequest(request)
  ) {
    return;
  }

  if (isStaticAssetRequest(request)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          return networkResponse;
        });
      })
    );
    return;
  }

  if (isPublicImageRequest(request)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) =>
        cache.match(request).then((cachedResponse) => {
          const networkFetch = fetch(request).then((networkResponse) => {
            if (networkResponse.ok) cache.put(request, networkResponse.clone());
            return networkResponse;
          }).catch(() => cachedResponse);
          return cachedResponse || networkFetch;
        })
      )
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  event.respondWith(fetch(request));
});
