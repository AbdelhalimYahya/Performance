'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

interface ChunkInfo {
  name: string;
  size: string;
  loadTime: string;
  type: string;
}

// SVG bundle architecture diagram — no external library needed
function BundleDiagram() {
  return (
    <svg viewBox="0 0 600 300" className="w-full h-64" aria-label="Bundle architecture diagram">
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      {/* Main bundle */}
      <rect x="20" y="20" width="160" height="60" rx="8" fill="url(#g1)" opacity="0.9" />
      <text x="100" y="45" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">main.js</text>
      <text x="100" y="62" textAnchor="middle" fill="white" fontSize="9">~80KB (initial)</text>
      {/* Route chunks */}
      <rect x="220" y="20" width="120" height="50" rx="6" fill="#10b981" opacity="0.8" />
      <text x="280" y="42" textAnchor="middle" fill="white" fontSize="10">home.js</text>
      <text x="280" y="56" textAnchor="middle" fill="white" fontSize="8">~15KB</text>
      <rect x="360" y="20" width="120" height="50" rx="6" fill="#f59e0b" opacity="0.8" />
      <text x="420" y="42" textAnchor="middle" fill="white" fontSize="10">splitting.js</text>
      <text x="420" y="56" textAnchor="middle" fill="white" fontSize="8">~20KB</text>
      <rect x="500" y="20" width="90" height="50" rx="6" fill="#ef4444" opacity="0.8" />
      <text x="545" y="42" textAnchor="middle" fill="white" fontSize="10">wasm.js</text>
      <text x="545" y="56" textAnchor="middle" fill="white" fontSize="8">~25KB</text>
      {/* Lazy chunks */}
      <rect x="20" y="120" width="140" height="50" rx="6" fill="#6366f1" opacity="0.7" strokeDasharray="4" />
      <text x="90" y="142" textAnchor="middle" fill="white" fontSize="10">HeavyChart.js</text>
      <text x="90" y="156" textAnchor="middle" fill="white" fontSize="8">~200KB (lazy)</text>
      <rect x="180" y="120" width="140" height="50" rx="6" fill="#8b5cf6" opacity="0.7" strokeDasharray="4" />
      <text x="250" y="142" textAnchor="middle" fill="white" fontSize="10">RichEditor.js</text>
      <text x="250" y="156" textAnchor="middle" fill="white" fontSize="8">~150KB (lazy)</text>
      <rect x="340" y="120" width="120" height="50" rx="6" fill="#ec4899" opacity="0.7" strokeDasharray="4" />
      <text x="400" y="142" textAnchor="middle" fill="white" fontSize="10">MapComponent</text>
      <text x="400" y="156" textAnchor="middle" fill="white" fontSize="8">~300KB (lazy)</text>
      <rect x="480" y="120" width="110" height="50" rx="6" fill="#14b8a6" opacity="0.7" strokeDasharray="4" />
      <text x="535" y="142" textAnchor="middle" fill="white" fontSize="10">VideoPlayer</text>
      <text x="535" y="156" textAnchor="middle" fill="white" fontSize="8">~180KB (lazy)</text>
      {/* Arrows */}
      <path d="M180 50 L220 45" stroke="#64748b" strokeWidth="1.5" fill="none" markerEnd="url(#arrow)" />
      <path d="M180 50 L360 45" stroke="#64748b" strokeWidth="1.5" fill="none" />
      <path d="M180 50 L500 45" stroke="#64748b" strokeWidth="1.5" fill="none" />
      <path d="M100 80 L90 120" stroke="#64748b" strokeWidth="1" fill="none" strokeDasharray="3" />
      <path d="M100 80 L250 120" stroke="#64748b" strokeWidth="1" fill="none" strokeDasharray="3" />
      <path d="M100 80 L400 120" stroke="#64748b" strokeWidth="1" fill="none" strokeDasharray="3" />
      <path d="M100 80 L535 120" stroke="#64748b" strokeWidth="1" fill="none" strokeDasharray="3" />
      {/* Legend */}
      <text x="20" y="210" fill="#94a3b8" fontSize="10">Solid = loaded on initial visit</text>
      <text x="20" y="226" fill="#94a3b8" fontSize="10">Dashed = loaded on demand (lazy)</text>
      <text x="20" y="260" fill="#64748b" fontSize="9">Each box = separate HTTP request. Smaller chunks = faster initial load.</text>
    </svg>
  );
}

// Reads performance entries to show loaded chunks
function ChunkInspector() {
  const [chunks, setChunks] = useState<ChunkInfo[]>([]);

  useEffect(() => {
    const entries = performance.getEntriesByType('resource');
    const jsChunks: ChunkInfo[] = entries
      .filter((e) => e.name.endsWith('.js') || e.name.includes('/_next/static/'))
      .map((e) => ({
        name: e.name.split('/').pop() || e.name,
        size: `${(e.transferSize / 1024).toFixed(1)}KB`,
        loadTime: `${e.duration.toFixed(0)}ms`,
        type: e.initiatorType,
      }));
    setChunks(jsChunks);
  }, []);

  return (
    <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-64">
      <h3 className="text-sm font-mono text-green-400 mb-2">Loaded JS Chunks ({chunks.length})</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500">
            <th className="text-left py-1">Chunk</th>
            <th className="text-right py-1">Size</th>
            <th className="text-right py-1">Load</th>
          </tr>
        </thead>
        <tbody>
          {chunks.map((c, i) => (
            <tr key={i} className="text-gray-300 border-t border-gray-800">
              <td className="py-1 font-mono truncate max-w-[200px]">{c.name}</td>
              <td className="text-right py-1 text-yellow-400">{c.size}</td>
              <td className="text-right py-1 text-blue-400">{c.loadTime}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HomePage() {
  const [importTime, setImportTime] = useState<number | null>(null);
  const [cached, setCached] = useState(false);
  const [chartLoaded, setChartLoaded] = useState(false);

  const loadChart = useCallback(async () => {
    const start = performance.now();
    const mod = await import('@/components/lazy/HeavyChart');
    const elapsed = performance.now() - start;
    setImportTime(Math.round(elapsed));
    setCached(elapsed < 5);
    setChartLoaded(true);
  }, []);

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Code Splitting Dashboard</h1>
      <p className="text-gray-400 mb-8">Visual guide to how JavaScript bundles load in this app.</p>

      {/* Bundle Architecture Diagram */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Bundle Architecture</h2>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <BundleDiagram />
        </div>
      </section>

      {/* Chunk Inspector */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Chunk Inspector</h2>
        <ChunkInspector />
      </section>

      {/* Dynamic Import Demo */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Load a Heavy Component</h2>
        <button
          onClick={loadChart}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {chartLoaded ? 'Reload Chart' : 'Load HeavyChart (~200KB)'}
        </button>

        {importTime !== null && (
          <div className="mt-4 bg-gray-900 rounded-lg p-4 border border-gray-800">
            <p className="text-sm">
              <span className="text-gray-400">Import time:</span>{' '}
              <span className="text-green-400 font-mono">{importTime}ms</span>
            </p>
            <p className="text-sm">
              <span className="text-gray-400">Source:</span>{' '}
              <span className={cached ? 'text-green-400' : 'text-yellow-400'}>
                {cached ? 'Cache (instant)' : 'Network (first load)'}
              </span>
            </p>
          </div>
        )}
      </section>

      {/* Navigation to Splitting Lab */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Explore</h2>
        <a
          href="/splitting"
          className="inline-block bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Code Splitting Lab →
        </a>
      </section>
    </main>
  );
}
