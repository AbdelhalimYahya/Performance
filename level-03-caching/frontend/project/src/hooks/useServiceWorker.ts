/**
 * useServiceWorker.ts — React hook for SW lifecycle management
 *
 * Registers the service worker, exposes install/update state, and provides
 * a skipWaiting() function for instant activation of new SW versions.
 *
 * Usage:
 *   const { isInstalled, isUpdating, offlineReady, skipWaiting } = useServiceWorker();
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

interface ServiceWorkerState {
  /** True once the SW has been installed and is controlling the page. */
  isInstalled: boolean;
  /** True while a new SW is being installed/updated in the background. */
  isUpdating: boolean;
  /** True after the SW signals that offline content is ready. */
  offlineReady: boolean;
  /** Call to force-activate the new SW (bypasses waiting phase). */
  skipWaiting: () => void;
}

export function useServiceWorker(): ServiceWorkerState {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    // SW API not available (SSR, disabled, or insecure context).
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let cancelled = false;

    async function register() {
      try {
        const registration = await navigator.serviceWorker.register(
          // Next.js serves the compiled SW from /sw.js at the public root.
          '/sw.js',
          { scope: '/' }
        );

        if (cancelled) return;

        // Already controlling the page — the SW is installed.
        if (navigator.serviceWorker.controller) {
          setIsInstalled(true);
        }

        // A new SW is installing in the background (update available).
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          setIsUpdating(true);

          newWorker.addEventListener('statechange', () => {
            if (cancelled) return;

            if (newWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // New SW installed but not yet active — waiting to take over.
                setWaitingSW(newWorker);
              } else {
                // First-time install — SW is ready.
                setIsInstalled(true);
                setOfflineReady(true);
              }
            }

            if (newWorker.state === 'activated') {
              setIsInstalled(true);
              setIsUpdating(false);
              setWaitingSW(null);
              setOfflineReady(true);
            }
          });
        });

        // Listen for the SW sending a "offline-ready" message.
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (cancelled) return;
          if (event.data?.type === 'OFFLINE_READY') {
            setOfflineReady(true);
          }
        });
      } catch (err) {
        console.warn('[useServiceWorker] Registration failed:', err);
      }
    }

    register();

    // Check for SW updates every 60 minutes.
    const interval = setInterval(() => {
      navigator.serviceWorker.controller?.update().catch(() => {});
    }, 60 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // skipWaiting: tell the waiting SW to activate immediately.
  const skipWaiting = useCallback(() => {
    if (waitingSW) {
      waitingSW.postMessage({ type: 'SKIP_WAITING' });
      setWaitingSW(null);
    }
  }, [waitingSW]);

  return { isInstalled, isUpdating, offlineReady, skipWaiting };
}
