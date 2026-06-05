'use client';

import { useState, useEffect } from 'react';

// Tipagem para o evento beforeinstallprompt que não é padrão no TS
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Detecta se já está instalado ou rodando como standalone
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches || 
        (window.navigator as any).standalone === true;
      setIsStandalone(isStandaloneMode);
    };

    // Detecta se é um dispositivo Apple iOS (iPhone/iPad) rodando no Safari nativo
    const checkIOS = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      const isAppleMobile = /iphone|ipad|ipod/.test(userAgent);
      const isSafari = /safari/.test(userAgent) && !/crios|fxios|opera|edgios/.test(userAgent);
      
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches || 
        (window.navigator as any).standalone === true;

      // Mostra apenas se for iOS, estiver no Safari e NÃO estiver rodando como standalone/instalado
      setIsIOS(isAppleMobile && isSafari && !isStandaloneMode);
    };

    checkStandalone();
    checkIOS();

    const handleBeforeInstallPrompt = (e: Event) => {
      // Impede o prompt padrão imediato do navegador
      e.preventDefault();
      // Armazena o evento para acionamento posterior
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstallable(false);
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = async () => {
    if (!deferredPrompt) return false;

    // Mostra o prompt nativo de instalação do navegador
    await deferredPrompt.prompt();
    
    // Aguarda a resposta do usuário
    const { outcome } = await deferredPrompt.userChoice;
    
    // O evento só pode ser usado uma vez, limpamos o estado
    setDeferredPrompt(null);
    setIsInstallable(false);

    return outcome === 'accepted';
  };

  return {
    isInstallable,
    isStandalone,
    isIOS,
    triggerInstall,
  };
}
