'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
// BAD PATTERN: importing everything eagerly
// This loads the entire library even if only a few functions are used
import { format, addDays, subDays, differenceInDays, parseISO } from 'date-fns';
import { debounce, throttle, groupBy, orderBy, uniqBy, flatten, chunk } from 'lodash-es';

interface Metric {
  name: string;
  value: string;
  status: 'bad' | 'ok';
}

export default function HeavyPage() {
  const [metrics, setMetrics] = useState<Metric[]>([]);

  useEffect(() => {
    const entries = performance.getEntriesByType('resource');
    const totalJS = entries
      .filter((e) => e.name.endsWith('.js'))
      .reduce((sum, e) => sum + e.transferSize, 0);

    const navEntries = performance.getEntriesByType('navigation');
    const nav = navEntries[0] as PerformanceNavigationTiming | undefined;

    setMetrics([
      { name: 'Total JS Loaded', value: `${(totalJS / 1024).toFixed(1)}KB`, status: totalJS > 500000 ? 'bad' : 'ok' },
      { name: 'LCP', value: nav ? `${((nav.loadEventEnd - nav.startTime) / 1000).toFixed(2)}s` : 'N/A', status: 'bad' },
      { name: 'Time to Interactive', value: nav ? `${((nav.domInteractive - nav.startTime) / 1000).toFixed(2)}s` : 'N/A', status: 'bad' },
      { name: 'Eager Imports', value: `${flatten([dateFnsExports, lodashExports]).length} modules`, status: 'bad' },
    ]);

    // Store for comparison in optimized page
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('heavy-page-metrics', JSON.stringify({
        totalJS: (totalJS / 1024).toFixed(1),
        timestamp: Date.now(),
      }));
    }
  }, []);

  // These imports are all available but most are NOT needed on this page
  const dateFnsExports = [format, addDays, subDays, differenceInDays, parseISO];
  const lodashExports = [debounce, throttle, groupBy, orderBy, uniqBy, flatten, chunk];

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Heavy Page (Bad Pattern)</h1>
          <p className="text-gray-400">Everything imported eagerly — 400KB+ of JS loaded upfront.</p>
        </div>
        <Link
          href="/splitting/optimized-page"
          className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg text-sm font-medium"
        >
          Optimized Version →
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {metrics.map((m) => (
          <div key={m.name} className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="text-xs text-gray-500 mb-1">{m.name}</div>
            <div className={`text-lg font-mono font-bold ${m.status === 'bad' ? 'text-red-400' : 'text-green-400'}`}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-red-400 mb-2">What went wrong?</h3>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>• All 5 date-fns functions imported (only 1 needed on this page)</li>
          <li>• All 7 lodash functions imported (none needed on this page)</li>
          <li>• No code splitting — everything in one chunk</li>
          <li>• Browser downloads, parses, and executes all of it before showing content</li>
        </ul>
      </div>
    </main>
  );
}
