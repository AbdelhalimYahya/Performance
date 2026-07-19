/**
 * QueryProvider.tsx — "use client" provider for React Query
 *
 * Wraps children with QueryClientProvider and includes React Query Devtools
 * in development mode only.
 *
 * SSR safety: the QueryClient is created via useState (not useRef or module-
 * level singleton) so each server-rendered request gets its own client,
 * preventing shared state leaks between users.
 */

'use client';

import { useState, type ReactNode } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/query-client';

// ---------------------------------------------------------------------------
// Lazy-load devtools — they are large and only needed in development.
// dynamic import ensures they are excluded from the production bundle.
// ---------------------------------------------------------------------------

let ReactQueryDevtools: React.ComponentType<{ queryClient: QueryClient }> | null = null;

if (process.env.NODE_ENV === 'development') {
  // The devtools package must be installed as a devDependency.
  // Using require() inside a conditional to avoid bundling in production.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@tanstack/react-query-devtools');
    ReactQueryDevtools = mod.ReactQueryDevtools;
  } catch {
    // Devtools not installed — silently skip
  }
}

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  // useState ensures the client is created once per component mount.
  // On the server, this runs once per request. On the client, once per page.
  const [queryClient] = useState<QueryClient>(() => makeQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}

      {ReactQueryDevtools && (
        <ReactQueryDevtools
          // initialIsOpen: false — devtools stay closed until manually opened.
          // This avoids a layout shift on first render.
          queryClient={queryClient}
        />
      )}
    </QueryClientProvider>
  );
}
