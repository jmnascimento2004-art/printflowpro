'use client';

import { useEffect } from 'react';

export default function PWARegister() {
  useEffect(() => {
    // Não registrar o Service Worker em modo de desenvolvimento para evitar cache indesejado e tela em branco.
    // Se houver algum registrado anteriormente em dev, removemos ele ativamente.
    if (process.env.NODE_ENV !== 'production') {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (let registration of registrations) {
            registration.unregister().then((success) => {
              if (success) {
                console.log('Service Worker de desenvolvimento desinstalado com sucesso.');
              }
            });
          }
        });
      }
      return;
    }

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Registrar o service worker quando a página carregar
      const registerSW = () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('Service Worker registrado com sucesso (escopo):', reg.scope);
          })
          .catch((err) => {
            console.error('Falha ao registrar o Service Worker:', err);
          });
      };

      if (document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW);
        return () => window.removeEventListener('load', registerSW);
      }
    }
  }, []);

  return null;
}
