'use client';

import { useEffect } from 'react';

export function StorePWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

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
