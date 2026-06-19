const VERSION = '2026-06-19-02';
const STATIC_CACHE = `printflowpro-static-${VERSION}`;
const BRANDING_CACHE = `printflowpro-branding-${VERSION}`;
const OFFLINE_URL = '/offline';

const STATIC_ASSETS = [
  OFFLINE_URL,
  '/screenshots/app-home-540x720.png',
  '/screenshots/app-home-1280x720.png'
];

function isSupabaseRequest(url) {
  return url.hostname.includes('supabase.co') || url.hostname.includes('supabase.in');
}

function isPrivateOrDynamicRequest(request) {
  const url = new URL(request.url);

  return (
    request.method !== 'GET' ||
    request.headers.has('authorization') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/auth/v1/') ||
    isSupabaseRequest(url)
  );
}

function isBrandingRequest(request) {
  const url = new URL(request.url);

  return (
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    (
      url.pathname === '/manifest.webmanifest' ||
      url.pathname === '/favicon.ico' ||
      url.pathname === '/icon.svg' ||
      url.pathname === '/apple-touch-icon.png' ||
      url.pathname.startsWith('/api/public/branding/icon') ||
      url.pathname.startsWith('/api/pwa/icon')
    )
  );
}

function isStaticAssetRequest(request) {
  const url = new URL(request.url);
  const staticDestination = ['font', 'script', 'style', 'worker'].includes(request.destination);

  return (
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') ||
      url.pathname.startsWith('/icons/') ||
      staticDestination)
  );
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
          .filter((cacheName) => cacheName.startsWith('printflowpro-') && ![STATIC_CACHE, BRANDING_CACHE].includes(cacheName))
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (isBrandingRequest(request)) {
    event.respondWith(
      caches.open(BRANDING_CACHE).then((cache) =>
        fetch(request).then((networkResponse) => {
          if (networkResponse.ok) cache.put(request, networkResponse.clone());
          return networkResponse;
        }).catch(() => cache.match(request))
      )
    );
    return;
  }

  if (isPrivateOrDynamicRequest(request)) {
    event.respondWith(fetch(request));
    return;
  }

  if (isStaticAssetRequest(request)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(request).then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, responseClone));
          return networkResponse;
        });
      })
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => networkResponse)
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  event.respondWith(fetch(request));
});
