'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type PwaInstallContextValue = {
  /** True once Chrome/Edge have actually offered an installable prompt to
   * capture — false on Safari/iOS (no such event exists there at all),
   * on browsers that already have the app installed, and before the
   * browser has decided the page is installable. */
  canInstall: boolean;
  /** Shows the browser's native install dialog. Resolves 'unavailable'
   * if canInstall was false — callers should fall back to manual
   * instructions in that case rather than doing nothing silently. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
};

const PwaInstallContext = createContext<PwaInstallContextValue>({
  canInstall: false,
  promptInstall: async () => 'unavailable',
});

export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }

    const onBeforeInstallPrompt = (event: Event) => {
      // Stops Chrome's own default mini-infobar so the ONLY install UI the
      // user sees is the one triggered by our own button.
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => setDeferredPrompt(null);

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return 'unavailable' as const;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    // A captured prompt can only be used once — drop it either way so a
    // second click doesn't silently no-op.
    setDeferredPrompt(null);
    return outcome;
  }, [deferredPrompt]);

  return (
    <PwaInstallContext.Provider value={{ canInstall: !!deferredPrompt, promptInstall }}>
      {children}
    </PwaInstallContext.Provider>
  );
}

export function usePwaInstall() {
  return useContext(PwaInstallContext);
}
