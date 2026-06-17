'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isAppleTouchClient } from './explorer/playback-capability';

const PWA_TOAST_SESSION_KEY = 'productions-pwa-install-toast-shown-v1';
const PWA_TOAST_HIDE_MS = 6000;

interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<readonly unknown[]>;
}

type InstallToastKind = 'install' | 'hint';

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const navigatorWithStandalone = window.navigator as NavigatorWithStandalone;
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
}

async function appMayAlreadyBeInstalled(): Promise<boolean> {
  const navigatorWithApps = window.navigator as NavigatorWithStandalone;
  if (!navigatorWithApps.getInstalledRelatedApps) return false;

  try {
    const relatedApps = await navigatorWithApps.getInstalledRelatedApps();
    return relatedApps.length > 0;
  } catch {
    return false;
  }
}

export default function PwaRegistrar() {
  const [toastKind, setToastKind] = useState<InstallToastKind | null>(null);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setToastKind(null);
  }, []);

  const showToastOnce = useCallback((kind: InstallToastKind) => {
    if (isStandaloneDisplay()) return;

    try {
      if (window.sessionStorage.getItem(PWA_TOAST_SESSION_KEY) === '1') return;
      window.sessionStorage.setItem(PWA_TOAST_SESSION_KEY, '1');
    } catch {
      // Session storage can be unavailable in strict privacy modes; still show once for this mount.
    }

    setToastKind(kind);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setToastKind(null);
      hideTimerRef.current = null;
    }, PWA_TOAST_HIDE_MS);
  }, []);

  const installApp = useCallback(() => {
    const deferredPrompt = deferredPromptRef.current;
    if (!deferredPrompt) return;

    dismissToast();
    deferredPromptRef.current = null;
    void deferredPrompt.prompt()
      .then(() => deferredPrompt.userChoice)
      .catch(() => undefined);
  }, [dismissToast]);

  useEffect(() => {
    const isLocalhost = typeof window !== 'undefined'
      && /^(localhost|127\.0\.0\.1|::1)$/.test(window.location.hostname);

    if (isLocalhost && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .then(() => ('caches' in window ? caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))) : undefined))
        .catch(() => undefined);
      return;
    }

    if ('serviceWorker' in navigator && !isLocalhost) {
      navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      }).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      void appMayAlreadyBeInstalled().then((installed) => {
        if (!cancelled && !installed) showToastOnce('install');
      });
    };

    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      dismissToast();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (!isStandaloneDisplay() && isAppleTouchClient()) {
      void appMayAlreadyBeInstalled().then((installed) => {
        if (!cancelled && !installed) showToastOnce('hint');
      });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [dismissToast, showToastOnce]);

  if (!toastKind) return null;

  return (
    <div className="productions-pwa-toast" role="status" aria-live="polite">
      <div className="productions-pwa-toast-copy">
        <p>{toastKind === 'install' ? 'Install this focused listening view.' : 'Add to Home Screen for a focused listening view.'}</p>
      </div>
      <div className="productions-pwa-toast-actions">
        {toastKind === 'install' ? (
          <button type="button" className="productions-pwa-toast-action" onClick={installApp}>
            Install
          </button>
        ) : null}
        <button type="button" className="productions-pwa-toast-close" onClick={dismissToast} aria-label="Dismiss app view suggestion">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
