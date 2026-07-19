/**
 * prefetch-demo/page.tsx — Advanced data loading patterns
 *
 * Four sections demonstrating how to eliminate request waterfalls:
 *   1. Waterfall vs Parallel visual comparison
 *   2. Server-side prefetch with hydration
 *   3. Route change prefetch on hover
 *   4. Dependent queries and how to collapse them
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  useQuery,
  useQueries,
  useQueryClient,
  QueryClient,
  dehydrate,
  HydrationBoundary,
} from '@tanstack/react-query';
import Link from 'next/link';

// ============================================================================
// Mock data & fetchers
// ============================================================================

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
}

interface Review {
  id: string;
  productId: string;
  rating: number;
  text: string;
}

interface Recommendation {
  id: string;
  name: string;
  price: number;
}

interface SellerInfo {
  name: string;
  rating: number;
  productsSold: number;
}

async function fetchProduct(id: string): Promise<Product> {
  await delay(200);
  return { id, name: `Product ${id}`, price: 99.99, category: 'electronics' };
}

async function fetchReviews(productId: string): Promise<Review[]> {
  await delay(300);
  return [
    { id: 'r1', productId, rating: 5, text: 'Great product!' },
    { id: 'r2', productId, rating: 4, text: 'Good value' },
  ];
}

async function fetchRecommendations(productId: string): Promise<Recommendation[]> {
  await delay(250);
  return [
    { id: 'rec-1', name: 'Related Item A', price: 49.99 },
    { id: 'rec-2', name: 'Related Item B', price: 79.99 },
  ];
}

async function fetchSeller(productId: string): Promise<SellerInfo> {
  await delay(150);
  return { name: 'TechStore Pro', rating: 4.8, productsSold: 12500 };
}

async function fetchProducts(): Promise<Product[]> {
  await delay(100);
  return Array.from({ length: 12 }, (_, i) => ({
    id: `prod-${i + 1}`,
    name: `Product ${i + 1}`,
    price: parseFloat((Math.random() * 200 + 10).toFixed(2)),
    category: ['electronics', 'clothing', 'home'][i % 3],
  }));
}

async function fetchUserProfile(id: string) {
  await delay(200);
  return { id, name: 'Jane Doe', email: 'jane@example.com' };
}

async function fetchUserOrders(userId: string) {
  await delay(300);
  return [
    { id: 'ord-1', userId, total: 149.99, status: 'delivered' },
    { id: 'ord-2', userId, total: 79.50, status: 'shipped' },
  ];
}

async function fetchOrderStatus(orderId: string) {
  await delay(100);
  return { orderId, carrier: 'FedEx', tracking: 'FX123456' };
}

// ============================================================================
// Section 1 — Waterfall vs Parallel
// ============================================================================

function WaterfallView() {
  const [timeline, setTimeline] = useState<{ label: string; start: number; end: number }[]>([]);
  const [totalTime, setTotalTime] = useState(0);
  const [running, setRunning] = useState(false);

  const runWaterfall = async () => {
    setRunning(true);
    setTimeline([]);
    const t0 = performance.now();
    const events: { label: string; start: number; end: number }[] = [];

    let t = performance.now();
    await fetchProduct('1');
    events.push({ label: 'Product', start: t - t0, end: performance.now() - t0 });
    t = performance.now();

    await fetchReviews('1');
    events.push({ label: 'Reviews', start: t - t0, end: performance.now() - t0 });
    t = performance.now();

    await fetchRecommendations('1');
    events.push({ label: 'Recommendations', start: t - t0, end: performance.now() - t0 });
    t = performance.now();

    await fetchSeller('1');
    events.push({ label: 'Seller', start: t - t0, end: performance.now() - t0 });

    setTimeline(events);
    setTotalTime(performance.now() - t0);
    setRunning(false);
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-red-600">Waterfall (Sequential)</h4>
        <button
          onClick={runWaterfall}
          disabled={running}
          className="px-3 py-1 text-xs bg-red-600 text-white rounded disabled:opacity-50"
        >
          {running ? 'Running...' : 'Run'}
        </button>
      </div>

      <div className="space-y-1 mb-3 min-h-[80px]">
        {timeline.map((event, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-28 text-right text-gray-500">{event.label}</span>
            <div className="flex-1 h-4 bg-gray-100 rounded relative">
              <div
                className="absolute h-full bg-red-400 rounded"
                style={{
                  left: `${(event.start / Math.max(totalTime, 1)) * 100}%`,
                  width: `${((event.end - event.start) / Math.max(totalTime, 1)) * 100}%`,
                }}
              />
            </div>
            <span className="w-16 text-gray-400">{(event.end - event.start).toFixed(0)}ms</span>
          </div>
        ))}
      </div>

      {totalTime > 0 && (
        <div className="text-sm font-medium">
          Total: <span className="text-red-600">{totalTime.toFixed(0)}ms</span>
        </div>
      )}
    </div>
  );
}

function ParallelView() {
  const [timeline, setTimeline] = useState<{ label: string; start: number; end: number }[]>([]);
  const [totalTime, setTotalTime] = useState(0);
  const [running, setRunning] = useState(false);

  const runParallel = async () => {
    setRunning(true);
    setTimeline([]);
    const t0 = performance.now();

    const results = await Promise.all([
      fetchProduct('1').then((d) => ({ label: 'Product', data: d })),
      fetchReviews('1').then((d) => ({ label: 'Reviews', data: d })),
      fetchRecommendations('1').then((d) => ({ label: 'Recommendations', data: d })),
      fetchSeller('1').then((d) => ({ label: 'Seller', data: d })),
    ]);

    const elapsed = performance.now() - t0;
    // All started at ~0, all ended at ~elapsed
    const events = results.map((r) => ({
      label: r.label,
      start: 0,
      end: elapsed,
    }));

    setTimeline(events);
    setTotalTime(elapsed);
    setRunning(false);
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-green-600">Parallel (Promise.all)</h4>
        <button
          onClick={runParallel}
          disabled={running}
          className="px-3 py-1 text-xs bg-green-600 text-white rounded disabled:opacity-50"
        >
          {running ? 'Running...' : 'Run'}
        </button>
      </div>

      <div className="space-y-1 mb-3 min-h-[80px]">
        {timeline.map((event, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-28 text-right text-gray-500">{event.label}</span>
            <div className="flex-1 h-4 bg-gray-100 rounded relative">
              <div
                className="absolute h-full bg-green-400 rounded"
                style={{
                  left: `${(event.start / Math.max(totalTime, 1)) * 100}%`,
                  width: `${((event.end - event.start) / Math.max(totalTime, 1)) * 100}%`,
                }}
              />
            </div>
            <span className="w-16 text-gray-400">{(event.end - event.start).toFixed(0)}ms</span>
          </div>
        ))}
      </div>

      {totalTime > 0 && (
        <div className="text-sm font-medium">
          Total: <span className="text-green-600">{totalTime.toFixed(0)}ms</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Section 2 — Server-side Prefetch with Hydration
// ============================================================================

function ServerPrefetchDemo() {
  // In a real Next.js app, this prefetch happens in a Server Component.
  // Here we simulate it with a client-side query that prefetches on mount.
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ['products', {}],
      queryFn: fetchProducts,
      staleTime: 60_000,
    });
  }, [queryClient]);

  const { data, isFetching } = useQuery({
    queryKey: ['products', {}],
    queryFn: fetchProducts,
  });

  return (
    <div className="border rounded-lg p-4">
      <h4 className="font-semibold mb-2">Server Prefetch + Hydration</h4>
      <div className="text-xs text-gray-500 mb-3 space-y-1">
        <p><code className="bg-gray-100 px-1 rounded">await queryClient.prefetchQuery(...)</code> — runs on server</p>
        <p><code className="bg-gray-100 px-1 rounded">{'<HydrationBoundary state={dehydrate(queryClient)}>'}</code> — passes cache to client</p>
        <p>Client receives pre-populated cache → zero client-side fetch on initial load</p>
      </div>

      <div className="text-xs mb-2">
        Status: {isFetching ? (
          <span className="text-yellow-600">Fetching from network...</span>
        ) : (
          <span className="text-green-600">Loaded from prefetch cache (no network request)</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
        {data?.slice(0, 6).map((p) => (
          <div key={p.id} className="text-xs p-2 bg-gray-50 rounded">
            <div className="font-medium truncate">{p.name}</div>
            <div className="text-gray-400">${p.price}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Section 3 — Route Change Prefetch
// ============================================================================

function PrefetchOnHoverDemo() {
  const queryClient = useQueryClient();
  const [prefetchedIds, setPrefetchedIds] = useState<Set<string>>(new Set());

  const { data: products } = useQuery({
    queryKey: ['products', 'grid'],
    queryFn: fetchProducts,
  });

  const prefetchProduct = useCallback(
    (id: string) => {
      if (prefetchedIds.has(id)) return;
      queryClient.prefetchQuery({
        queryKey: ['product', id],
        queryFn: () => fetchProduct(id),
        staleTime: 30_000,
      });
      setPrefetchedIds((prev) => new Set(prev).add(id));
    },
    [queryClient, prefetchedIds],
  );

  return (
    <div className="border rounded-lg p-4">
      <h4 className="font-semibold mb-2">Prefetch on Hover</h4>
      <p className="text-xs text-gray-500 mb-3">
        Hover over a card to prefetch its detail data. The badge shows prefetch status.
        Navigate to see instant load.
      </p>

      <div className="grid grid-cols-3 gap-2">
        {products?.slice(0, 9).map((p) => (
          <Link
            key={p.id}
            href={`/products/${p.id}`}
            onMouseEnter={() => prefetchProduct(p.id)}
            className="block p-3 border rounded hover:shadow-md transition-shadow"
          >
            <div className="text-xs font-medium truncate">{p.name}</div>
            <div className="text-xs text-gray-400">${p.price}</div>
            <div className="mt-1">
              {prefetchedIds.has(p.id) ? (
                <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                  Prefetched
                </span>
              ) : (
                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                  Not prefetched
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Section 4 — Dependent Queries
// ============================================================================

function DependentQueriesDemo() {
  const [timeline, setTimeline] = useState<{ label: string; start: number; end: number }[]>([]);
  const [totalTime, setTotalTime] = useState(0);
  const [running, setRunning] = useState(false);

  const runDependent = async () => {
    setRunning(true);
    setTimeline([]);
    const t0 = performance.now();
    const events: { label: string; start: number; end: number }[] = [];

    let t = performance.now();
    const user = await fetchUserProfile('user-1');
    events.push({ label: 'User Profile', start: t - t0, end: performance.now() - t0 });
    t = performance.now();

    const orders = await fetchUserOrders(user.id);
    events.push({ label: 'User Orders', start: t - t0, end: performance.now() - t0 });
    t = performance.now();

    await Promise.all(orders.map((o) => fetchOrderStatus(o.id)));
    events.push({ label: 'Order Statuses (parallel)', start: t - t0, end: performance.now() - t0 });

    setTimeline(events);
    setTotalTime(performance.now() - t0);
    setRunning(false);
  };

  // Collapsed version: single endpoint
  const [collapsedTime, setCollapsedTime] = useState(0);
  const [collapsedRunning, setCollapsedRunning] = useState(false);

  const runCollapsed = async () => {
    setCollapsedRunning(true);
    const t0 = performance.now();
    // Simulate one backend call that does all three queries server-side
    await delay(400); // single round-trip, backend does all queries
    setCollapsedTime(performance.now() - t0);
    setCollapsedRunning(false);
  };

  return (
    <div className="border rounded-lg p-4">
      <h4 className="font-semibold mb-2">Dependent Queries</h4>
      <p className="text-xs text-gray-500 mb-3">
        User → Orders → Order Statuses: each depends on the previous. This waterfall is
        unavoidable on the client. Solution: collapse into a single server-side endpoint.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {/* Client-side dependent */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-red-600">3 client round-trips</span>
            <button
              onClick={runDependent}
              disabled={running}
              className="px-2 py-1 text-[10px] bg-red-600 text-white rounded disabled:opacity-50"
            >
              Run
            </button>
          </div>
          <div className="space-y-1 min-h-[60px]">
            {timeline.map((event, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px]">
                <span className="w-24 text-right text-gray-500">{event.label}</span>
                <div className="flex-1 h-3 bg-gray-100 rounded relative">
                  <div
                    className="absolute h-full bg-red-400 rounded"
                    style={{
                      left: `${(event.start / Math.max(totalTime, 1)) * 100}%`,
                      width: `${((event.end - event.start) / Math.max(totalTime, 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          {totalTime > 0 && (
            <div className="text-xs mt-1">
              Total: <span className="text-red-600 font-medium">{totalTime.toFixed(0)}ms</span>
            </div>
          )}
        </div>

        {/* Collapsed server-side */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-green-600">1 server round-trip</span>
            <button
              onClick={runCollapsed}
              disabled={collapsedRunning}
              className="px-2 py-1 text-[10px] bg-green-600 text-white rounded disabled:opacity-50"
            >
              Run
            </button>
          </div>
          <div className="min-h-[60px] flex items-center">
            {collapsedRunning ? (
              <div className="text-xs text-gray-400">Single request in flight...</div>
            ) : collapsedTime > 0 ? (
              <div className="text-xs">
                <div className="w-full h-3 bg-gray-100 rounded relative mb-1">
                  <div
                    className="absolute h-full bg-green-400 rounded"
                    style={{ width: '100%' }}
                  />
                </div>
                Total: <span className="text-green-600 font-medium">{collapsedTime.toFixed(0)}ms</span>
              </div>
            ) : (
              <div className="text-xs text-gray-400">Click Run to compare</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function PrefetchDemoPage() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold mb-2">Data Prefetching & Parallel Queries</h1>
        <p className="text-gray-600 text-sm">
          Patterns for eliminating request waterfalls and loading data as fast as possible.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-4 border-b pb-2">
          1. Waterfall vs Parallel
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <WaterfallView />
          <ParallelView />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4 border-b pb-2">
          2. Server-side Prefetch with Hydration
        </h2>
        <ServerPrefetchDemo />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4 border-b pb-2">
          3. Route Change Prefetch on Hover
        </h2>
        <PrefetchOnHoverDemo />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4 border-b pb-2">
          4. Dependent Queries
        </h2>
        <DependentQueriesDemo />
      </section>
    </main>
  );
}
