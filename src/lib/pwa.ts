export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export function isStandaloneApp() {
  if (typeof window === 'undefined') return false;

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function isIOSDevice() {
  if (typeof window === 'undefined') return false;

  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function isSafariBrowser() {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  return userAgent.includes('safari') && !userAgent.includes('crios') && !userAgent.includes('fxios') && !userAgent.includes('edgios');
}

export function canShowIOSInstallHelp() {
  return isIOSDevice() && isSafariBrowser() && !isStandaloneApp();
}
