'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// Only import what we actually need — tree-shakeable
import { format } from 'date-fns';

interface Metric {
  name: string;
  value: string;
  status: 'good' | 'ok';
  heavyValue?: string;
}

export default function OptimizedPage() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [chartVisible, setChartVisible] = useState(false);

  // Lazy load the chart — not in initial bundle
  const loadChart = useCallback(async () => {
    setChartVisible(true);
  }, []);

  useEffect(() => {
    const entries = performance.getEntriesByType('resource');
    const totalJS = entries
      .filter((e) => e.name.endsWith('.js'))
      .reduce((sum, e) => sum + e.transferSize, 0);

    const navEntries = performance.getEntriesByType('navigation');
    const nav = navEntries[0] as PerformanceNavigationTiming | undefined;

    const heavyMetrics = JSON.parse(sessionStorage.getItem('heavy-page-metrics') || '{}');

    setMetrics([
      {
        name: 'Total JS Loaded',
        value: `${(totalJS / 1024).toFixed(1)}KB`,
        status: 'good',
        heavyValue: heavyMetrics.totalJS ? `${heavyMetrics.totalJS}KB` : undefined,
      },
      {
        name: 'LCP',
        value: nav ? `${((nav.loadEventEnd - nav.startTime) / 1000).toFixed(2)}s` : 'N/A',
        status: 'good',
      },
      {
        name: 'Time to Interactive',
        value: nav ? `${((nav.domInteractive - nav.startTime) / 1000).toFixed(2)}s` : 'N/A',
        status: 'good',
      },
      { name: 'Eager Imports', value: '1 module', status: 'good', heavyValue: '12 modules' },
    ]);
  }, []);

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Optimized Page</h1>
          <p className="text-gray-400">Only what&apos;s needed is loaded. Chart loads on demand.</p>
        </div>
        <Link
          href="/splitting/heavy-page"
          className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium"
        >
          ← Heavy Version
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {metrics.map((m) => (
          <div key={m.name} className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="text-xs text-gray-500 mb-1">{m.name}</div>
            <div className="text-lg font-mono font-bold text-green-400">{m.value}</div>
            {m.heavyValue && (
              <div className="text-xs text-red-400 mt-1">vs {m.heavyValue}</div>
            )}
          </div>
        ))}
      </div>

      {/* Lazy chart section */}
      <div className="mb-8">
        <button
          onClick={loadChart}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium mb-4"
        >
          Load Chart (lazy)
        </button>

        {chartVisible && (
          <Suspense fallback={<div className="h-64 bg-gray-800 rounded-lg animate-pulse" />}>
            <LazyChart />
          </Suspense>
        )}
      </div>

      <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-green-400 mb-2">What improved?</h3>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>• Only <code className="text-green-400">format</code> imported from date-fns (1 of 5 functions)</li>
          <li>• No lodash loaded at all (not needed on this page)</li>
          <li>• Chart is lazy-loaded — only appears when user clicks</li>
          <li>• Initial bundle is significantly smaller</li>
        </ul>
      </div>
    </main>
  );
}

// Dynamically imported chart component
const LazyChart = dynamic(
  () => import('@/components/lazy/HeavyChart'),
  { ssr: false }
);
