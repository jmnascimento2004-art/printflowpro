'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import {
  BeforeInstallPromptEvent,
  canShowIOSInstallHelp,
  isStandaloneApp
} from '@/lib/pwa';

type PWAInstallContextValue = {
  canInstall: boolean;
  canShowIOSHelp: boolean;
  isInstalled: boolean;
  installApp: () => Promise<'accepted' | 'dismissed' | 'ios-help' | 'unavailable'>;
};

const PWAInstallContext = createContext<PWAInstallContextValue>({
  canInstall: false,
  canShowIOSHelp: false,
  isInstalled: false,
  installApp: async () => 'unavailable'
});
const isCustomInstallPromptEnabled = process.env.NEXT_PUBLIC_ENABLE_CUSTOM_PWA_INSTALL === 'true';

export function PWAInstallProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canShowIOSHelpState, setCanShowIOSHelpState] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsInstalled(isStandaloneApp());
    setCanShowIOSHelpState(canShowIOSInstallHelp());

    const onBeforeInstallPrompt = (event: Event) => {
      if (!isCustomInstallPromptEnabled) return;

      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setCanShowIOSHelpState(false);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const installApp = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);

      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }

      return choice.outcome;
    }

    if (canShowIOSHelpState && !isInstalled) return 'ios-help';
    return 'unavailable';
  }, [canShowIOSHelpState, deferredPrompt, isInstalled]);

  const value = useMemo(() => ({
    canInstall: Boolean(deferredPrompt) || (canShowIOSHelpState && !isInstalled),
    canShowIOSHelp: canShowIOSHelpState && !isInstalled && !deferredPrompt,
    isInstalled,
    installApp
  }), [canShowIOSHelpState, deferredPrompt, installApp, isInstalled]);

  return (
    <PWAInstallContext.Provider value={value}>
      {children}
    </PWAInstallContext.Provider>
  );
}

export function usePWAInstall() {
  return useContext(PWAInstallContext);
}
