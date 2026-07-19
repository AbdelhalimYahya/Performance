/**
 * cache-demo/page.tsx — Interactive Cache Behavior Dashboard
 *
 * Five visual sections that teach how React Query and SWR caches behave.
 * "use client" because every section requires hooks (useState, useEffect,
 * useQuery, etc.).
 */

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  useQueryClient,
  useQuery,
  useMutation,
  QueryClient,
} from '@tanstack/react-query';
import useSWR from 'swr';
import { products as productKeys } from '@/lib/query-keys';

// ============================================================================
// Shared Types
// ============================================================================

interface CacheEntry {
  key: string[];
  status: string;
  data?: unknown;
  dataUpdatedAt?: number;
  fetchStatus?: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
}

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_PRODUCTS: Product[] = Array.from({ length: 20 }, (_, i) => ({
  id: `prod-${i + 1}`,
  name: `Product ${i + 1}`,
  price: parseFloat((Math.random() * 500 + 9.99).toFixed(2)),
  category: ['electronics', 'clothing', 'home', 'sports'][i % 4],
}));

const MOCK_PRODUCT_MAP = Object.fromEntries(
  MOCK_PRODUCTS.map((p) => [p.id, p])
);

// Simulated fetcher — adds artificial delay
function createFetcher(delayMs: number) {
  return async (key: string): Promise<Product> => {
    await new Promise((r) => setTimeout(r, delayMs));
    const product = MOCK_PRODUCT_MAP[key];
    if (!product) throw new Error(`Not found: ${key}`);
    return product;
  };
}

// ============================================================================
// Section 1 — Cache State Inspector
// ============================================================================

function CacheStateInspector() {
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [tick, setTick] = useState(0);

  // Poll cache state every 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      const cache = queryClient.getQueryCache();
      const all = cache.getAll();
      setEntries(
        all.map((q) => ({
          key: q.queryKey as string[],
          status: q.state.status,
          data: q.state.data,
          dataUpdatedAt: q.state.dataUpdatedAt,
          fetchStatus: q.state.fetchStatus,
        }))
      );
      setTick((t) => t + 1);
    }, 500);
    return () => clearInterval(interval);
  }, [queryClient]);

  const statusColor = (s: string) => {
    if (s === 'success') return 'bg-green-100 text-green-800';
    if (s === 'fetching') return 'bg-blue-100 text-blue-800';
    if (s === 'error') return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-600';
  };

  return (
    <section className="mb-12">
      <h2 className="text-xl font-bold mb-4">1. Cache State Inspector</h2>
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => queryClient.clear()}
          className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
        >
          Clear All Cache
        </button>
        <button
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: productKeys.all() })
          }
          className="px-3 py-1 text-sm bg-amber-500 text-white rounded hover:bg-amber-600"
        >
          Invalidate Products
        </button>
        <span className="ml-auto text-xs text-gray-400 self-center">
          Poll #{tick}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Query Key</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Fetch</th>
              <th className="px-3 py-2 text-left">Size (est.)</th>
              <th className="px-3 py-2 text-left">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-gray-400">
                  No active cache entries. Click a button above or navigate to a
                  section below.
                </td>
              </tr>
            )}
            {entries.map((e, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">
                  [{e.key.map((k) => JSON.stringify(k)).join(', ')}]
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(e.status)}`}
                  >
                    {e.status}
                  </span>
                </td>
                <td className="px-3 py-2">{e.fetchStatus ?? 'idle'}</td>
                <td className="px-3 py-2">
                  {e.data ? `${(JSON.stringify(e.data).length / 1024).toFixed(1)} KB` : '—'}
                </td>
                <td className="px-3 py-2">
                  {e.dataUpdatedAt
                    ? new Date(e.dataUpdatedAt).toLocaleTimeString()
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ============================================================================
// Section 2 — staleTime vs gcTime Lab
// ============================================================================

function StaleTimeLab() {
  return (
    <section className="mb-12">
      <h2 className="text-xl font-bold mb-4">2. staleTime vs gcTime Lab</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <LabCard label="staleTime: 0" staleTime={0} />
        <LabCard label="staleTime: 30s" staleTime={30_000} />
        <LabCard label="staleTime: 5min" staleTime={300_000} />
      </div>
    </section>
  );
}

function LabCard({ label, staleTime }: { label: string; staleTime: number }) {
  const [renderCount, setRenderCount] = useState(0);
  const queryClient = useQueryClient();

  const { data, dataUpdatedAt, status, fetchStatus } = useQuery<Product[], Error>({
    queryKey: ['lab', staleTime],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 800));
      return MOCK_PRODUCTS.slice(0, 5);
    },
    staleTime,
    refetchOnWindowFocus: true,
  });

  useEffect(() => setRenderCount((c) => c + 1), [data]);

  const ageMs = dataUpdatedAt ? Date.now() - dataUpdatedAt : null;
  const isStale = ageMs !== null && ageMs > staleTime && staleTime > 0;

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      <h3 className="font-semibold mb-2">{label}</h3>
      <dl className="text-sm space-y-1">
        <div className="flex justify-between">
          <dt className="text-gray-500">Status</dt>
          <dd>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                isStale ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
              }`}
            >
              {isStale ? 'stale' : status}
            </span>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Fetch status</dt>
          <dd className="font-mono text-xs">{fetchStatus}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Render count</dt>
          <dd>{renderCount}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Last fetched</dt>
          <dd>{dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Items</dt>
          <dd>{data?.length ?? 0}</dd>
        </div>
      </dl>
      <button
        onClick={() => {
          queryClient.setQueryData(['lab', staleTime], undefined as any);
          queryClient.invalidateQueries({ queryKey: ['lab', staleTime] });
        }}
        className="mt-3 w-full px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
      >
        Force Stale
      </button>
    </div>
  );
}

// ============================================================================
// Section 3 — Optimistic Update Demo
// ============================================================================

function OptimisticDemo() {
  const [products, setProducts] = useState(() =>
    MOCK_PRODUCTS.slice(0, 5).map((p) => ({ ...p }))
  );
  const [simulateError, setSimulateError] = useState(false);
  const [lifecycle, setLifecycle] = useState<string[]>([]);
  const [optimisticId, setOptimisticId] = useState<string | null>(null);

  const addLifecycle = (msg: string) =>
    setLifecycle((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] ${msg}`,
    ]);

  const updatePrice = async (id: string, newPrice: number) => {
    addLifecycle(`mutating: ${id} → $${newPrice}`);
    setOptimisticId(id);

    // Optimistic update — update local state immediately
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, price: newPrice } : p))
    );
    addLifecycle(`optimistic applied: ${id} → $${newPrice}`);

    // Simulate server delay
    await new Promise((r) => setTimeout(r, 1500));

    if (simulateError) {
      // Rollback
      setProducts((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, price: MOCK_PRODUCTS.find((mp) => mp.id === id)!.price }
            : p
        )
      );
      addLifecycle(`rollback: ${id} reverted to original price`);
      setOptimisticId(null);
      throw new Error('Simulated server error');
    }

    addLifecycle(`server confirmed: ${id} saved`);
    setOptimisticId(null);
    addLifecycle('settled');
  };

  return (
    <section className="mb-12">
      <h2 className="text-xl font-bold mb-4">3. Optimistic Update Demo</h2>
      <div className="flex items-center gap-4 mb-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={simulateError}
            onChange={(e) => setSimulateError(e.target.checked)}
            className="rounded"
          />
          Simulate server error
        </label>
        <button
          onClick={() => setLifecycle([])}
          className="text-xs text-gray-400 underline"
        >
          Clear log
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          {products.map((p) => (
            <div
              key={p.id}
              className={`flex items-center gap-3 p-3 border rounded mb-2 transition-all ${
                optimisticId === p.id
                  ? 'bg-blue-50 border-blue-300'
                  : 'bg-white'
              }`}
            >
              <span className="flex-1 text-sm font-medium">{p.name}</span>
              <input
                type="number"
                defaultValue={p.price}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val !== p.price) {
                    updatePrice(p.id, val).catch(() => {});
                  }
                }}
                className="w-24 px-2 py-1 text-sm border rounded text-right"
              />
              {optimisticId === p.id && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium animate-pulse">
                  Optimistic
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="bg-gray-900 text-green-400 rounded p-3 text-xs font-mono overflow-y-auto max-h-64">
          <div className="text-gray-500 mb-1">Mutation lifecycle:</div>
          {lifecycle.length === 0 && (
            <div className="text-gray-600">Edit a price to start...</div>
          )}
          {lifecycle.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Section 4 — Prefetch on Hover
// ============================================================================

function PrefetchDemo() {
  const queryClient = useQueryClient();
  const [prefetchStates, setPrefetchStates] = useState<
    Record<string, 'idle' | 'prefetching' | 'ready' | 'hit'>
  >({});

  const startPrefetch = useCallback(
    (id: string) => {
      // Already prefetched or cached — skip
      const cached = queryClient.getQueryCache().find({
        queryKey: productKeys.detail(id),
      });
      if (cached && cached.state.status === 'success') {
        setPrefetchStates((prev) => ({ ...prev, [id]: 'hit' }));
        return;
      }

      setPrefetchStates((prev) => ({ ...prev, [id]: 'prefetching' }));
      const start = performance.now();

      queryClient.prefetchQuery({
        queryKey: productKeys.detail(id),
        queryFn: async () => {
          await new Promise((r) => setTimeout(r, 300)); // simulate network
          return MOCK_PRODUCT_MAP[id];
        },
        staleTime: 30_000,
      });

      // Poll until resolved
      const check = setInterval(() => {
        const q = queryClient.getQueryCache().find({
          queryKey: productKeys.detail(id),
        });
        if (q?.state.status === 'success') {
          clearInterval(check);
          const ms = Math.round(performance.now() - start);
          setPrefetchStates((prev) => ({ ...prev, [id]: 'ready' }));
          // Show "ready" for 2s, then show "hit"
          setTimeout(() => {
            setPrefetchStates((prev) => {
              if (prev[id] === 'ready') return { ...prev, [id]: 'hit' };
              return prev;
            });
          }, 2000);
        }
      }, 50);
    },
    [queryClient]
  );

  const badge = (id: string) => {
    const state = prefetchStates[id] ?? 'idle';
    const map = {
      idle: 'bg-gray-100 text-gray-600',
      prefetching: 'bg-blue-100 text-blue-700 animate-pulse',
      ready: 'bg-green-100 text-green-700',
      hit: 'bg-emerald-100 text-emerald-700',
    };
    const label = {
      idle: 'Not prefetched',
      prefetching: 'Prefetching...',
      ready: 'Ready',
      hit: 'Cache hit!',
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded ${map[state]}`}>
        {label[state]}
      </span>
    );
  };

  return (
    <section className="mb-12">
      <h2 className="text-xl font-bold mb-4">4. Prefetch on Hover</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {MOCK_PRODUCTS.map((p) => (
          <div
            key={p.id}
            onMouseEnter={() => startPrefetch(p.id)}
            className="border rounded p-3 bg-white hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="text-sm font-medium truncate">{p.name}</div>
            <div className="text-xs text-gray-400 mt-1">{p.category}</div>
            <div className="mt-2">{badge(p.id)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// Section 5 — SWR vs React Query Comparison
// ============================================================================

function SWRvsRQComparison() {
  const [reactQueryFetches, setReactQueryFetches] = useState(0);
  const [swrFetches, setSwrFetches] = useState(0);

  // --- React Query side ---
  const rq = useQuery<Product[], Error>({
    queryKey: ['comparison-products'],
    queryFn: async () => {
      setReactQueryFetches((c) => c + 1);
      await new Promise((r) => setTimeout(r, 500));
      return MOCK_PRODUCTS.slice(0, 10);
    },
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  // --- SWR side ---
  const swrFetcher = useCallback(async () => {
    setSwrFetches((c) => c + 1);
    await new Promise((r) => setTimeout(r, 500));
    return MOCK_PRODUCTS.slice(0, 10);
  }, []);

  const swr = useSWR<Product[]>('/api/comparison', swrFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
  });

  const RQCard = () => (
    <div className="border rounded p-4 bg-white">
      <h3 className="font-semibold mb-2">React Query</h3>
      <dl className="text-sm space-y-1">
        <div className="flex justify-between">
          <dt className="text-gray-500">Status</dt>
          <dd>{rq.status}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Fetch count</dt>
          <dd>{reactQueryFetches}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Items loaded</dt>
          <dd>{rq.data?.length ?? 0}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Last updated</dt>
          <dd>
            {rq.dataUpdatedAt
              ? new Date(rq.dataUpdatedAt).toLocaleTimeString()
              : '—'}
          </dd>
        </div>
      </dl>
      <button
        onClick={() => rq.refetch()}
        className="mt-3 w-full px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Manual Refetch
      </button>
    </div>
  );

  const SWRCard = () => (
    <div className="border rounded p-4 bg-white">
      <h3 className="font-semibold mb-2">SWR</h3>
      <dl className="text-sm space-y-1">
        <div className="flex justify-between">
          <dt className="text-gray-500">Status</dt>
          <dd>{swr.isValidating ? 'validating' : swr.error ? 'error' : 'ready'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Fetch count</dt>
          <dd>{swrFetches}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Items loaded</dt>
          <dd>{swr.data?.length ?? 0}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Last updated</dt>
          <dd>{swr.dataUpdatedAt ? new Date(swr.dataUpdatedAt).toLocaleTimeString() : '—'}</dd>
        </div>
      </dl>
      <button
        onClick={() => swr.mutate()}
        className="mt-3 w-full px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600"
      >
        Manual Revalidate
      </button>
    </div>
  );

  return (
    <section className="mb-12">
      <h2 className="text-xl font-bold mb-4">5. SWR vs React Query Comparison</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RQCard />
        <SWRCard />
      </div>
    </section>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function CacheDemoPage() {
  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-8 border-b pb-4">
        Cache Behavior Dashboard
      </h1>
      <CacheStateInspector />
      <StaleTimeLab />
      <OptimisticDemo />
      <PrefetchDemo />
      <SWRvsRQComparison />
    </main>
  );
}
