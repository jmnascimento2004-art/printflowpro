'use client';

import { useEffect, useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import {
  BeforeInstallPromptEvent,
  canShowIOSInstallHelp,
  isStandaloneApp
} from '@/lib/pwa';

export function StoreInstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [canShowIOSHelp, setCanShowIOSHelp] = useState(false);

  useEffect(() => {
    setIsInstalled(isStandaloneApp());
    setCanShowIOSHelp(canShowIOSInstallHelp());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstallPrompt(null);
      setShowIOSHelp(false);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  if (isInstalled || (!installPrompt && !canShowIOSHelp)) return null;

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstallPrompt(null);
        setIsInstalled(true);
      }
      return;
    }

    setShowIOSHelp(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstall}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-500/15 dark:text-emerald-300"
      >
        <Download className="h-4 w-4" />
        Instalar catalogo
      </button>

      {showIOSHelp && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Adicionar loja ao celular</h3>
                  <p className="text-xs text-slate-500">Safari usa o menu de compartilhamento do iOS.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSHelp(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3 text-xs leading-5 text-slate-600">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                Toque no icone <Share className="mx-1 inline h-3.5 w-3.5 text-emerald-600" /> Compartilhar.
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                Escolha <strong className="text-slate-950">Adicionar a Tela de Inicio</strong> e confirme.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSHelp(false)}
              className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
