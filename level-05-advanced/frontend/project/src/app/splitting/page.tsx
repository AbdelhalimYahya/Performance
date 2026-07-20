'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// Lazy-loaded components
const HeavyChart = dynamic(() => import('@/components/lazy/HeavyChart'), {
  loading: () => <div className="h-64 bg-gray-800 rounded-lg animate-pulse" />,
  ssr: false,
});

import dynamic from 'next/dynamic';

function RouteSplittingTab() {
  const [chunkInfo, setChunkInfo] = useState<{ name: string; size: string }[]>([]);

  useEffect(() => {
    const entries = performance.getEntriesByType('resource');
    const jsChunks = entries
      .filter((e) => e.name.endsWith('.js'))
      .map((e) => ({
        name: e.name.split('/').pop() || 'unknown',
        size: `${(e.transferSize / 1024).toFixed(1)}KB`,
      }));
    setChunkInfo(jsChunks);
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h3 className="text-sm font-medium text-gray-300 mb-2">JS Chunks Loaded for This Route</h3>
        <div className="space-y-1">
          {chunkInfo.map((c, i) => (
            <div key={i} className="flex justify-between text-xs font-mono">
              <span className="text-gray-400 truncate max-w-[250px]">{c.name}</span>
              <span className="text-yellow-400">{c.size}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3">Navigate to Other Routes (each loads its own chunk)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { href: '/splitting/heavy-page', label: 'Heavy Page', color: 'bg-red-600', badge: '~500KB' },
            { href: '/splitting/optimized-page', label: 'Optimized Page', color: 'bg-green-600', badge: '~120KB' },
            { href: '/wasm-demo', label: 'WASM Demo', color: 'bg-blue-600', badge: '~200KB' },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`${link.color} hover:opacity-90 rounded-lg p-4 transition-opacity`}
            >
              <div className="text-sm font-medium">{link.label}</div>
              <div className="text-xs opacity-75 mt-1">Chunk: {link.badge}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function ComponentSplittingTab() {
  const [loadTime, setLoadTime] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [strategy, setStrategy] = useState<'click' | 'hover'>('click');

  const handleLoad = useCallback(async () => {
    const start = performance.now();
    await import('@/components/lazy/HeavyChart');
    setLoadTime(Math.round(performance.now() - start));
    setIsLoaded(true);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={() => setStrategy('click')}
          className={`px-3 py-1 rounded text-sm ${strategy === 'click' ? 'bg-blue-600' : 'bg-gray-700'}`}
        >
          Load on Click
        </button>
        <button
          onMouseEnter={strategy === 'hover' ? handleLoad : undefined}
          onClick={strategy === 'click' ? handleLoad : undefined}
          className={`px-3 py-1 rounded text-sm ${strategy === 'hover' ? 'bg-blue-600' : 'bg-gray-700'}`}
        >
          {strategy === 'hover' ? 'Hover to Prefetch' : 'Click to Load'}
        </button>
      </div>

      {!isLoaded && (
        <div className="h-64 bg-gray-800 rounded-lg flex items-center justify-center text-gray-500">
          {strategy === 'hover' ? 'Hover the button above to prefetch' : 'Click the button above to load the chart'}
        </div>
      )}

      {isLoaded && (
        <>
          <HeavyChart />
          <div className="bg-gray-800 rounded-lg p-3 text-sm">
            <span className="text-gray-400">Chunk loaded in </span>
            <span className="text-green-400 font-mono">{loadTime}ms</span>
            {loadTime !== null && loadTime < 5 && (
              <span className="text-blue-400 ml-2">(from cache)</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LibrarySplittingTab() {
  return (
    <div className="space-y-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 border-b border-gray-700">
            <th className="text-left py-2">Library</th>
            <th className="text-right py-2">Full Size</th>
            <th className="text-right py-2">Tree-Shaken</th>
            <th className="text-right py-2">Savings</th>
          </tr>
        </thead>
        <tbody className="text-gray-300">
          <tr className="border-b border-gray-800">
            <td className="py-2">lodash</td>
            <td className="text-right text-red-400">72KB</td>
            <td className="text-right text-green-400">lodash-es (10KB)</td>
            <td className="text-right text-green-400">86%</td>
          </tr>
          <tr className="border-b border-gray-800">
            <td className="py-2">moment.js</td>
            <td className="text-right text-red-400">330KB</td>
            <td className="text-right text-green-400">date-fns (15KB)</td>
            <td className="text-right text-green-400">95%</td>
          </tr>
          <tr>
            <td className="py-2">axios</td>
            <td className="text-right text-red-400">14KB</td>
            <td className="text-right text-green-400">fetch (0KB)</td>
            <td className="text-right text-green-400">100%</td>
          </tr>
        </tbody>
      </table>

      <details className="bg-gray-800 rounded-lg p-4">
        <summary className="text-sm font-medium cursor-pointer text-blue-400">
          Why does this matter?
        </summary>
        <div className="mt-3 text-sm text-gray-400 space-y-2">
          <p><strong className="text-white">Before:</strong> 330KB (moment.js) + 72KB (lodash) = 402KB gzipped</p>
          <p><strong className="text-white">After:</strong> 15KB (date-fns) + 10KB (lodash-es) = 25KB gzipped</p>
          <p className="text-green-400 font-medium">94% reduction in vendor bundle size</p>
        </div>
      </details>
    </div>
  );
}

const TABS = [
  { key: 'route', label: 'Route Splitting' },
  { key: 'component', label: 'Component Splitting' },
  { key: 'library', label: 'Library Splitting' },
] as const;

export default function SplittingPage() {
  const [activeTab, setActiveTab] = useState<'route' | 'component' | 'library'>('route');

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Code Splitting Lab</h1>
      <p className="text-gray-400 mb-8">Three strategies for reducing initial bundle size.</p>

      <div className="flex gap-2 mb-8">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'route' && <RouteSplittingTab />}
      {activeTab === 'component' && <ComponentSplittingTab />}
      {activeTab === 'library' && <LibrarySplittingTab />}
    </main>
  );
}
