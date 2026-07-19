/**
 * service-worker.ts — Production Service Worker with all major caching strategies
 *
 * Built on Workbox. The build step generates the precache manifest (self.__WB_MANIFEST).
 * This file is NOT the final SW — it is the source that workbox-webpack-plugin compiles.
 *
 * Five parts:
 *   1. Precaching — Next.js build assets
 *   2. Runtime caching — per-route strategy definitions
 *   3. Offline fallback — navigation and API failure handling
 *   4. Background sync — replay failed mutations when online
 *   5. Cache cleanup — delete stale caches on activate
 */

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute, NavigationRoute, Route } from 'workbox-routing';
import {
  StaleWhileRevalidate,
  CacheFirst,
  NetworkFirst,
} from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

declare const self: ServiceWorkerGlobalScope;

// ============================================================================
// Part 1 — Precaching
// ============================================================================

// Workbox injects the precache manifest at build time.
// Each entry is { url, revision } pointing to a hashed build asset.
try {
  precacheAndRoute(self.__WB_MANIFEST);
} catch (err) {
  // If precaching fails (e.g. missing manifest in dev), log and continue.
  // The SW must not crash during install or the browser won't register it.
  console.warn('[SW] Precaching failed, continuing without precache:', err);
}

// ============================================================================
// Part 2 — Runtime Caching Routes
// ============================================================================

// 2a. Product list — StaleWhileRevalidate
// Serve cached data immediately, update cache in background.
registerRoute(
  ({ url }) => url.pathname === '/api/products' && url.searchParams.get('method') !== 'POST',
  new StaleWhileRevalidate({
    cacheName: 'api-products',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 }),
    ],
  })
);

// 2b. Product detail — CacheFirst
// Product details rarely change; cache aggressively.
registerRoute(
  ({ url }) => /^\/api\/products\/[^/]+$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'api-product-detail',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 300 }),
    ],
  })
);

// 2c. User profile — NetworkFirst with 3s timeout
// Always try network first; fall back to cache if offline.
registerRoute(
  ({ url }) => url.pathname === '/api/user/profile',
  new NetworkFirst({
    cacheName: 'api-user',
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// 2d. Next.js static assets — CacheFirst with 1-year expiry
// These are content-hashed, so they never go stale.
registerRoute(
  ({ url }) => url.pathname.startsWith('/_next/static/'),
  new CacheFirst({
    cacheName: 'next-static',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxAgeSeconds: 31_536_000 }), // 1 year
    ],
  })
);

// 2e. Images — CacheFirst
// Covers /images/ paths and external CDN images.
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/images/') ||
    /\.(png|jpg|jpeg|gif|webp|svg|ico)$/.test(url.pathname) ||
    url.hostname !== self.location.hostname,
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 86_400 }),
    ],
  })
);

// 2f. Fonts — CacheFirst with 1-year expiry
registerRoute(
  ({ url }) =>
    /fonts\.(googleapis|gstatic)\.com/.test(url.hostname) ||
    /\.(woff2?|ttf|otf|eot)$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'fonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 31_536_000 }),
    ],
  })
);

// ============================================================================
// Part 3 — Offline Fallback
// ============================================================================

const OFFLINE_CACHE = 'offline-page';
const OFFLINE_PAGE = '/offline';

// Cache the offline page during the SW install.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => {
      return cache.add(OFFLINE_PAGE).catch((err) => {
        console.warn('[SW] Could not cache offline page:', err);
      });
    })
  );
  // Activate immediately without waiting for old SW to die.
  self.skipWaiting();
});

// Navigation fallback → serve /offline for failed navigations.
const navigationRoute = new NavigationRoute(
  new NetworkFirst({
    cacheName: 'pages',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
    // If network fails, this handler falls through. We catch it below.
  })
);

// Override the default handler to inject offline fallback.
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle navigation requests for offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(OFFLINE_CACHE);
        const cached = await cache.match(OFFLINE_PAGE);
        return cached || new Response('Offline', { status: 503 });
      })
    );
    return;
  }

  // API requests that fail → return a structured JSON offline response.
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(async () => {
        // Check if there's a cached response for this URL.
        const cache = await caches.open('api-fallback');
        const cached = await cache.match(request);
        if (cached) return cached;

        return new Response(
          JSON.stringify({ error: 'offline', cached: false }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      })
    );
  }
});

// ============================================================================
// Part 4 — Background Sync
// ============================================================================

// Queue failed POST/PUT/DELETE mutations for replay when online.
const bgSyncPlugin = new BackgroundSyncPlugin('mutation-queue', {
  maxRetentionTime: 60 * 24, // Keep entries for 24 hours
});

// Intercept mutating API requests and queue on failure.
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method),
  new NetworkFirst({
    cacheName: 'api-mutations',
    plugins: [bgSyncPlugin],
  }),
  'POST' // Only register for POST (and other mutating methods via the filter above)
);

// Listen for successful sync events to log replay results.
self.addEventListener('sync', (event) => {
  if (event.tag === 'mutation-queue') {
    event.waitUntil(replayMutations());
  }
});

async function replayMutations(): Promise<void> {
  const cache = await caches.open('mutation-queue');
  const keys = await cache.keys();
  console.log(`[SW] Background sync: replaying ${keys.length} queued mutation(s)`);

  for (const request of keys) {
    try {
      const response = await fetch(request.clone());
      const status = response.ok ? 'success' : `HTTP ${response.status}`;
      console.log(`[SW] Replayed ${request.method} ${request.url} → ${status}`);
      await cache.delete(request);
    } catch (err) {
      console.warn(`[SW] Replay failed for ${request.method} ${request.url}:`, err);
    }
  }
}

// ============================================================================
// Part 5 — Cache Cleanup on Activate
// ============================================================================

// List of caches managed by this SW version.
const CURRENT_CACHES = [
  'api-products',
  'api-product-detail',
  'api-user',
  'next-static',
  'images',
  'fonts',
  'pages',
  'api-mutations',
  'api-fallback',
  OFFLINE_CACHE,
];

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (!CURRENT_CACHES.includes(name)) {
            console.log(`[SW] Deleting old cache: ${name}`);
            return caches.delete(name);
          }
          return Promise.resolve();
        })
      );
    })
  );
  // Take control of all open clients immediately.
  self.clients.claim();
});
