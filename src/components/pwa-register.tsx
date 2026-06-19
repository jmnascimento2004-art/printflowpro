'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { BrandMark } from '@/components/brand';
import { isStandaloneApp } from '@/lib/pwa';

export default function PWARegister() {
  const pathname = usePathname();
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standalone = isStandaloneApp();
    setShowSplash(standalone);

    if (standalone) {
      const timer = window.setTimeout(() => setShowSplash(false), 850);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (pathname === '/store' || pathname.startsWith('/store/')) return;

    let refreshing = false;

    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const registerServiceWorker = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(async (registration) => {
        await navigator.serviceWorker.ready;

        if (process.env.NODE_ENV === 'development') {
          console.info('[PWA] Admin service worker ready', registration.scope);
        }

        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setShowUpdate(true);
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setShowUpdate(true);
            }
          });
        });
      }).catch(() => {
        // PWA registration is progressive enhancement; keep the ERP usable if it fails.
      });
    };

    if (document.readyState === 'complete') {
      registerServiceWorker();
    } else {
      window.addEventListener('load', registerServiceWorker, { once: true });
    }

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.removeEventListener('load', registerServiceWorker);
    };
  }, [pathname]);

  const updateNow = () => {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  };

  return (
    <>
      {showSplash && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#F7F9FC] text-slate-950">
          <div className="flex flex-col items-center gap-4">
            <BrandMark className="h-16 w-16" />
            <div className="text-center">
              <p className="text-lg font-black text-[#1D35C9]">PrintFlowPRO</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Carregando aplicativo</p>
            </div>
          </div>
        </div>
      )}

      {showUpdate && (
        <div className="fixed bottom-4 right-4 z-[80] w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-blue-100 bg-white p-4 text-slate-900 shadow-2xl shadow-slate-900/15 no-print">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1D35C9]">
              <RefreshCw className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">Nova versao disponivel</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Uma nova versao do PrintFlowPRO esta disponivel.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={updateNow}
                  className="rounded-lg bg-[#1D35C9] px-3 py-2 text-xs font-black text-white"
                >
                  Atualizar agora
                </button>
                <button
                  type="button"
                  onClick={() => setShowUpdate(false)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"
                >
                  Depois
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowUpdate(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
