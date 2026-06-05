'use client';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function usePWA() {
  return {
    isInstallable: false,
    isStandalone: false,
    isIOS: false,
    triggerInstall: async () => false
  };
}
