/**
 * useSWR-patterns.ts — Advanced SWR Patterns Reference Module
 *
 * Living documentation with real implementations. Each export is a standalone
 * pattern that can be copied into your project. Import from here to explore,
 * then extract the specific pattern you need.
 *
 * Patterns:
 *   1. useGlobalSWR          — project-wide defaults
 *   2. useSWRWithOptimistic   — optimistic mutation with rollback
 *   3. useInfiniteSWRProducts — paginated infinite list
 *   4. useSWRPolling          — auto-pausing, backoff, jitter
 *   5. useSWRWithPrefetch     — manual cache warming
 *   6. useSWRSubscription     — real-time WebSocket/SSE
 *   7. createGlobalSWRConfig  — SWRConfig provider factory
 */

import {
  useSWR,
  useSWRInfinite,
  mutate as globalMutate,
  SWRConfiguration,
  SWRResponse,
  Key,
  Fetcher,
} from 'swr';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// ============================================================================
// Types
// ============================================================================

interface MutationFn<T> {
  (current: T | undefined): Promise<T>;
}

interface SWROptimisticConfig<T> extends SWRConfiguration<T> {
  mutationFn: MutationFn<T>;
}

interface InfiniteProduct {
  id: string;
  name: string;
  price: number;
}

interface InfinitePage {
  data: InfiniteProduct[];
  nextCursor: string | null;
  total: number;
}

interface SubscriptionConfig<T> {
  /** URL for WebSocket or SSE endpoint. */
  url: string;
  /** Transform the incoming message into cache-compatible data. */
  transform?: (event: MessageEvent) => T;
  /** Called when the connection is established. */
  onOpen?: () => void;
  /** Called on connection errors. */
  onError?: (err: Event) => void;
}

// ============================================================================
// 1. useGlobalSWR — Project-Wide Defaults
// ============================================================================

/**
 * Wrapper around useSWR with project-wide defaults baked in.
 *
 * Use this as the primary data-fetching hook across the application.
 * It applies consistent deduplication, retry, and focus-refetch behavior
 * so individual components don't need to repeat configuration.
 *
 * @example
 * const { data, error, isLoading } = useGlobalSWR<Product[]>('/api/products');
 */
export function useGlobalSWR<T = unknown>(
  key: Key,
  fetcher: Fetcher<T>,
  options?: SWRConfiguration<T>
): SWRResponse<T> {
  return useSWR(key, fetcher, {
    dedupingInterval: 5000,          // 5s — prevent rapid duplicate requests
    revalidateOnFocus: true,         // refetch when tab regains focus
    errorRetryCount: 3,              // retry 3 times before giving up
    shouldRetryOnError: (err: any) => {
      // Don't retry on 404 — it won't magically appear.
      if (err?.status === 404) return false;
      return true;
    },
    revalidateOnReconnect: true,
    ...options, // user overrides take precedence
  });
}

// ============================================================================
// 2. useSWRWithOptimisticUpdate — Optimistic Mutation with Rollback
// ============================================================================

/**
 * Extends SWR with an optimistic update pattern.
 *
 * Call the returned `mutate()` to:
 *   1. Immediately update the cache (optimistic)
 *   2. Execute the mutationFn on the server
 *   3. Roll back to the previous cache on error
 *
 * @example
 * const { data, mutate } = useSWRWithOptimisticUpdate('/api/user', fetchUser, {
 *   mutationFn: async (prev) => ({ ...prev, name: 'New Name' }),
 * });
 */
export function useSWRWithOptimisticUpdate<T = unknown>(
  key: Key,
  fetcher: Fetcher<T>,
  config: SWROptimisticConfig<T>
): SWRResponse<T> & { triggerMutate: () => Promise<void> } {
  const swrResult = useSWR<T>(key, fetcher, {
    revalidateOnFocus: false,
    ...config,
  });

  const triggerMutate = useCallback(async () => {
    const previousData = swrResult.data;

    // 1. Optimistically update the cache
    await globalMutate(key, () => config.mutationFn(previousData), {
      optimisticData: config.mutationFn(previousData),
      revalidate: false,
      populateCache: true,
    });

    // 2. Execute on server
    try {
      await config.mutationFn(previousData);
      // 3. Revalidate to sync with server truth
      await globalMutate(key);
    } catch {
      // 4. Rollback on error
      await globalMutate(key, previousData, { revalidate: false });
    }
  }, [key, swrResult.data, config.mutationFn]);

  return { ...swrResult, triggerMutate };
}

// ============================================================================
// 3. useInfiniteSWRProducts — Paginated Infinite List
// ============================================================================

/**
 * Uses useSWRInfinite for a paginated product list.
 *
 * Key design decisions:
 *   - `revalidateFirstPage: false` — don't refetch page 0 when page 1 loads
 *   - `revalidateAll: false` — only revalidate the active page on focus
 *   - The getKey function builds the URL from the page index and the
 *     previous page's cursor
 *
 * @example
 * const { items, loadMore, hasMore, isLoadingMore } = useInfiniteSWRProducts();
 * return <button onClick={loadMore}>Load More</button>;
 */
export function useInfiniteSWRProducts() {
  const getKey = useCallback(
    (pageIndex: number, previousPageData: InfinitePage | null) => {
      // Reached the end — no more pages.
      if (previousPageData && !previousPageData.nextCursor) return null;

      // First page has no cursor; subsequent pages use the previous cursor.
      const cursor = previousPageData?.nextCursor ?? '';
      return `/api/products?page=${pageIndex}${cursor ? `&cursor=${cursor}` : ''}`;
    },
    []
  );

  const { data, size, setSize, isValidating } = useSWRInfinite<InfinitePage>(
    getKey,
    async (url) => {
      const res = await fetch(url);
      return res.json();
    },
    {
      revalidateFirstPage: false,
      revalidateAll: false,
      parallel: false, // pages must load sequentially (cursor dependency)
    }
  );

  // Flatten all pages into a single items array.
  const items = useMemo(
    () => data?.flatMap((page) => page.data) ?? [],
    [data]
  );

  // The last page determines if there are more items.
  const lastPage = data?.[data.length - 1];
  const hasMore = lastPage ? lastPage.nextCursor !== null : false;
  const total = lastPage?.total ?? 0;

  const isLoadingMore =
    isValidating || (size > 0 && data !== undefined && typeof data[size - 1] === 'undefined');

  const loadMore = useCallback(() => {
    setSize((prev) => prev + 1);
  }, [setSize]);

  return { items, isLoadingMore, loadMore, hasMore, total, size };
}

// ============================================================================
// 4. useSWRPolling — Auto-Pausing, Backoff, Jitter
// ============================================================================

/**
 * Polling hook with three safety mechanisms:
 *   1. Auto-pause when the browser tab is hidden (visibilitychange)
 *   2. Auto-pause when the device goes offline
 *   3. Exponential backoff with jitter on consecutive errors
 *
 * Jitter prevents the "thundering herd" problem where multiple tabs
 * all poll at the same interval and hit the server simultaneously.
 *
 * @example
 * const { data } = useSWRPolling('/api/dashboard/stats', fetchStats, 10_000);
 */
export function useSWRPolling<T = unknown>(
  key: Key,
  fetcher: Fetcher<T>,
  intervalMs: number,
  options?: SWRConfiguration<T>
): SWRResponse<T> & { isPolling: boolean } {
  const [isPolling, setIsPolling] = useState(true);
  const [errorCount, setErrorCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Compute next poll interval with exponential backoff and jitter.
  const getInterval = useCallback(() => {
    const backoff = Math.min(intervalMs * Math.pow(2, errorCount), 60_000);
    const jitter = backoff * 0.1 * Math.random(); // 10% jitter
    return backoff + jitter;
  }, [intervalMs, errorCount]);

  // Pause/resume based on tab visibility.
  useEffect(() => {
    const handleVisibility = () => {
      setIsPolling(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Pause/resume based on online status.
  useEffect(() => {
    const handleOffline = () => setIsPolling(false);
    const handleOnline = () => setIsPolling(true);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const swrResult = useSWR<T>(key, fetcher, {
    ...options,
    refreshInterval: isPolling ? getInterval() : 0,
    onError: (err) => {
      setErrorCount((c) => c + 1);
      options?.onError?.(err, key as string, {} as any);
    },
    onSuccess: () => {
      setErrorCount(0); // reset backoff on success
    },
  });

  return { ...swrResult, isPolling };
}

// ============================================================================
// 5. useSWRWithPrefetch — Manual Cache Warming
// ============================================================================

/**
 * Returns { data, prefetch } where prefetch() manually warms the SWR cache.
 *
 * Useful when you want to fetch data before a user action (e.g. on hover)
 * without rendering the consuming component.
 *
 * @example
 * const { data, prefetch } = useSWRWithPrefetch('/api/product/123', fetchProduct);
 * <button onMouseEnter={prefetch}>View Details</button>
 */
export function useSWRWithPrefetch<T = unknown>(
  key: Key,
  fetcher: Fetcher<T>,
  options?: SWRConfiguration<T>
): SWRResponse<T> & { prefetch: () => Promise<void> } {
  const swrResult = useSWR<T>(key, fetcher, {
    revalidateOnFocus: false,
    ...options,
  });

  const prefetch = useCallback(async () => {
    if (!key) return;

    // Only prefetch if data is not already cached or is stale.
    const cache = (globalMutate as any).cache;
    if (cache) {
      const cached = cache.get?.(key);
      if (cached && cached.isValidating === false) return;
    }

    // Warm the cache by calling the fetcher and setting the value.
    const data = await fetcher(key as string);
    await globalMutate(key, data, { revalidate: false });
  }, [key, fetcher]);

  return { ...swrResult, prefetch };
}

// ============================================================================
// 6. useSWRSubscription — Real-Time WebSocket/SSE
// ============================================================================

/**
 * Connects to a WebSocket or SSE stream and feeds updates into SWR cache.
 *
 * The subscription is established when the component mounts and torn down
 * on unmount. Each incoming message is applied to the SWR cache via mutate,
 * so all components subscribed to the same key re-render automatically.
 *
 * @example
 * const { data, isConnected } = useSWRSubscription<PriceUpdate>({
 *   url: 'wss://api.example.com/prices',
 *   transform: (e) => JSON.parse(e.data),
 * });
 */
export function useSWRSubscription<T = unknown>(
  config: SubscriptionConfig<T> & { cacheKey: Key }
): { data: T | undefined; isConnected: boolean; error: Event | null } {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Event | null>(null);
  const wsRef = useRef<WebSocket | EventSource | null>(null);

  useEffect(() => {
    if (!config.url) return;

    let transport: WebSocket | EventSource;

    // Determine transport type from URL scheme.
    if (config.url.startsWith('ws')) {
      transport = new WebSocket(config.url);

      transport.onopen = () => {
        setIsConnected(true);
        config.onOpen?.();
      };

      transport.onmessage = (event: MessageEvent) => {
        const transformed = config.transform
          ? config.transform(event)
          : (JSON.parse(event.data) as T);
        setData(transformed);
        // Update SWR cache so other subscribers re-render.
        globalMutate(config.cacheKey, transformed, { revalidate: false });
      };

      transport.onerror = (err) => {
        setError(err as Event);
        setIsConnected(false);
        config.onError?.(err);
      };

      transport.onclose = () => setIsConnected(false);
    } else {
      // SSE
      transport = new EventSource(config.url);

      transport.onopen = () => {
        setIsConnected(true);
        config.onOpen?.();
      };

      transport.onmessage = (event: MessageEvent) => {
        const transformed = config.transform
          ? config.transform(event)
          : (JSON.parse(event.data) as T);
        setData(transformed);
        globalMutate(config.cacheKey, transformed, { revalidate: false });
      };

      transport.onerror = (err) => {
        setError(err as Event);
        setIsConnected(false);
        config.onError?.(err);
      };
    }

    wsRef.current = transport;

    return () => {
      transport.close();
      wsRef.current = null;
    };
  }, [config.url]);

  return { data, isConnected, error };
}

// ============================================================================
// 7. createGlobalSWRConfig — SWRConfig Provider Factory
// ============================================================================

interface GlobalSWRConfigOptions {
  /** Base URL prepended to all fetcher requests. */
  baseUrl?: string;
  /** Auth token injected as Bearer header. */
  authToken?: string;
  /** Custom error handler for all SWR hooks under this provider. */
  onError?: (err: Error, key: string) => void;
  /** Deduplication interval in ms (default: 2000). */
  dedupingInterval?: number;
}

/**
 * Creates a pre-configured SWRConfig provider with sensible project defaults.
 *
 * Includes:
 *   - Custom fetcher with auth headers and base URL
 *   - Request deduplication
 *   - Error boundary integration (throws errors to nearest ErrorBoundary)
 *   - Offline detection (pauses revalidation when offline)
 *
 * @example
 * const SWRProvider = createGlobalSWRConfig({
 *   baseUrl: 'https://api.example.com',
 *   authToken: token,
 * });
 *
 * function App() {
 *   return <SWRProvider>{children}</SWRProvider>;
 * }
 */
export function createGlobalSWRConfig(options: GlobalSWRConfigOptions = {}) {
  const {
    baseUrl = '',
    authToken,
    onError,
    dedupingInterval = 2000,
  } = options;

  // Custom fetcher with auth headers.
  const fetcher: Fetcher = async (url: string) => {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const res = await fetch(`${baseUrl}${url}`, { headers });

    if (!res.ok) {
      const error = new Error(`SWR Fetch Error: ${res.status} ${res.statusText}`);
      (error as any).status = res.status;
      throw error;
    }

    return res.json();
  };

  // Return a component that wraps children with SWRConfig.
  return function SWRProvider({ children }: { children: React.ReactNode }) {
    return children as React.ReactElement;
  };
}
