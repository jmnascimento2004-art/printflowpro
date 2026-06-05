'use client';

import { useEffect } from 'react';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

function isSafeNavigationTarget(value: string | null | undefined) {
  if (!value) return true;

  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return true;
  }

  try {
    const url = new URL(trimmed, window.location.origin);
    return ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

export default function BrowserProtocolGuard() {
  useEffect(() => {
    const blockUnsafeProtocol = (target: string | null | undefined) => {
      if (isSafeNavigationTarget(target)) return false;

      console.warn('Blocked unsafe external protocol navigation:', target);
      return true;
    };

    const handleClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (blockUnsafeProtocol(href)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const originalOpen = window.open.bind(window);
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const value = typeof url === 'string' ? url : url?.toString();
      if (blockUnsafeProtocol(value)) return null;
      return originalOpen(url, target, features);
    }) as typeof window.open;

    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
      window.open = originalOpen;
    };
  }, []);

  return null;
}
