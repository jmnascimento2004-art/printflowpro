'use client';

import { useEffect } from 'react';

function cleanupDevelopmentStorePWA() {
  const unregisterServiceWorkers = navigator.serviceWorker.getRegistrations()
    .then((registrations) => Promise.all(
      registrations
        .filter((registration) => registration.scope.startsWith(`${window.location.origin}/`))
        .map((registration) => registration.unregister())
    ));

  const deleteAppCaches = 'caches' in window
    ? window.caches.keys().then((cacheNames) => Promise.all(
      cacheNames.map((cacheName) => window.caches.delete(cacheName))
    ))
    : Promise.resolve([]);

  Promise.all([unregisterServiceWorkers, deleteAppCaches]).catch((error) => {
    console.warn('[PWA] Falha ao limpar service workers/caches da loja em desenvolvimento.', error);
  });
}

export function StorePWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      cleanupDevelopmentStorePWA();
      return;
    }

    const register = () => {
      navigator.serviceWorker.register('/store-sw.js', { scope: '/store/' }).catch((error) => {
        console.warn('[PWA] Falha ao registrar service worker da loja.', error);
      });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
