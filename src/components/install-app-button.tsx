'use client';

import { useEffect, useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import {
  BeforeInstallPromptEvent,
  canShowIOSInstallHelp,
  isStandaloneApp
} from '@/lib/pwa';

export function InstallAppButton({ onDone }: { onDone?: () => void }) {
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
      onDone?.();
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [onDone]);

  if (isInstalled || (!installPrompt && !canShowIOSHelp)) return null;

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstallPrompt(null);
        setIsInstalled(true);
        onDone?.();
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
        className="w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-lg text-left transition-all text-primary hover:bg-primary/10 font-semibold"
      >
        <Download className="h-3.5 w-3.5" />
        Instalar aplicativo
      </button>

      {showIOSHelp && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-foreground">Instalar no iPhone</h3>
                  <p className="text-xs text-muted-foreground">Safari usa o menu de compartilhamento do iOS.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSHelp(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3 text-xs leading-5 text-muted-foreground">
              <div className="rounded-xl border border-border bg-secondary/40 p-3">
                Toque no icone <Share className="mx-1 inline h-3.5 w-3.5 text-primary" /> Compartilhar do Safari.
              </div>
              <div className="rounded-xl border border-border bg-secondary/40 p-3">
                Escolha <strong className="text-foreground">Adicionar a Tela de Inicio</strong> e confirme.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSHelp(false)}
              className="mt-5 w-full rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground shadow-md shadow-primary/20"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
