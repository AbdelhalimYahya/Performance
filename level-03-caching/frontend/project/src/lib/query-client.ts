/**
 * query-client.ts — Production React Query configuration
 *
 * Creates a QueryClient with carefully tuned defaults for a typical SaaS app.
 * The makeQueryClient() factory is required for SSR: Next.js App Router renders
 * each request on the server, and a shared singleton would leak state between
 * requests.
 */

import { QueryClient, QueryMeta } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether an error is a 404 Not Found.
 * Works with Error objects that have a `status` property (common with
 * react-query fetchers that throw structured errors).
 */
function isNotFoundError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    return (err as { status: number }).status === 404;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Exponential backoff with a 30-second cap
// ---------------------------------------------------------------------------

/**
 * retryDelay — exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s.
 * Formula: min(cap, 1000 * 2^attempt)
 */
function exponentialBackoff(attempt: number): number {
  const BASE = 1000;
  const CAP = 30_000;
  return Math.min(CAP, BASE * Math.pow(2, attempt));
}

// ---------------------------------------------------------------------------
// QueryClient factory
// ---------------------------------------------------------------------------

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is fresh for 60 seconds — no refetch during this window.
        staleTime: 60_000,

        // Keep inactive cache entries for 5 minutes before garbage collection.
        gcTime: 5 * 60_000,

        // Retry up to 2 times, but never retry on 404 (it won't magically appear).
        retry: (failureCount, err) => {
          if (isNotFoundError(err)) return false;
          return failureCount < 2;
        },

        // Exponential backoff between retries (1s → 2s → 4s, capped at 30s).
        retryDelay: (attempt) => exponentialBackoff(attempt),

        // Refetch when the user returns to the tab — keeps data fresh.
        refetchOnWindowFocus: true,

        // Refetch after the browser regains connectivity.
        refetchOnReconnect: true,
      },

      mutations: {
        // Global mutation error handler.
        // Individual mutations can override this via their own onError.
        onError: (error) => {
          const info = {
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
            stack: error instanceof Error ? error.stack : undefined,
          };
          // In production, send to Sentry / Datadog / etc.
          console.error('[Mutation Error]', info);
        },
      },
    },

    // Optional: global query meta for cache-time overrides per query
    // queryCache: new QueryCache({ ... }),
    // mutationCache: new MutationCache({ ... }),
  });
}
