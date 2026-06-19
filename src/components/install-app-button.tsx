'use client';

import { useEffect, useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '@/components/pwa-install-provider';

type InstallAppButtonProps = {
  onDone?: () => void;
  variant?: 'menu' | 'header';
};

export function InstallAppButton({ onDone, variant = 'menu' }: InstallAppButtonProps) {
  const { canInstall, canShowIOSHelp, isInstalled, installApp } = usePWAInstall();
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    if (isInstalled) {
      setShowIOSHelp(false);
    }
  }, [isInstalled]);

  if (isInstalled || !canInstall) return null;

  const handleInstall = async () => {
    const result = await installApp();

    if (result === 'ios-help') {
      setShowIOSHelp(true);
      return;
    }

    if (result === 'accepted' || result === 'dismissed') {
      onDone?.();
    }
  };

  const isHeader = variant === 'header';
  const label = canShowIOSHelp ? 'Adicionar a Tela de Inicio' : 'Instalar aplicativo';

  return (
    <>
      <button
        type="button"
        onClick={handleInstall}
        className={
          isHeader
            ? 'hidden sm:flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-black text-primary transition-all hover:bg-primary/15'
            : 'w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-lg text-left transition-all text-primary hover:bg-primary/10 font-semibold'
        }
        title={label}
      >
        <Download className="h-3.5 w-3.5" />
        <span>{isHeader ? 'Instalar' : label}</span>
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
                  <h3 className="text-sm font-black text-foreground">Adicionar a Tela de Inicio</h3>
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
                1. Toque no icone <Share className="mx-1 inline h-3.5 w-3.5 text-primary" /> Compartilhar do Safari.
              </div>
              <div className="rounded-xl border border-border bg-secondary/40 p-3">
                2. Selecione <strong className="text-foreground">Adicionar a Tela de Inicio</strong>.
              </div>
              <div className="rounded-xl border border-border bg-secondary/40 p-3">
                3. Confirme em <strong className="text-foreground">Adicionar</strong>.
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
