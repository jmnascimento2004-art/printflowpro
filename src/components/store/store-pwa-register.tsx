'use client';

import { useEffect } from 'react';

export function StorePWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations
          .filter((registration) => registration.scope === `${window.location.origin}/store/`)
          .forEach((registration) => registration.unregister());
      }).catch(() => {
        // Development cleanup is best effort; production Store PWA behavior is unchanged.
      });
      return;
    }

    const register = () => {
      navigator.serviceWorker.register('/store-sw.js', { scope: '/store/' }).catch(() => {
        // Store PWA is progressive enhancement; keep the catalog usable if registration fails.
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
