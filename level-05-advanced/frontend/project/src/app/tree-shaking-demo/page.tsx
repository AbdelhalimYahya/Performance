'use client';

import { useState, useEffect } from 'react';

// GOOD: direct imports from individual files (tree-shakeable)
import { format } from 'date-fns/format';
import { debounce } from 'lodash-es';
import { add, multiply } from '@/tree-shaking/utils/math';
import { capitalize, slugify } from '@/tree-shaking/utils/strings';
import { formatDateSafe, daysBetween } from '@/tree-shaking/utils/dates';

interface ChunkInfo {
  name: string;
  size: number;
  containsTreeShaken: boolean;
}

interface LibraryCheck {
  name: string;
  treeShakeable: boolean;
  reason: string;
  sideEffects: boolean | undefined;
}

const TREE_SHAKEABLE_LIBRARIES: LibraryCheck[] = [
  { name: 'lodash-es', treeShakeable: true, reason: 'ESM package, each function is separate module', sideEffects: false },
  { name: 'date-fns', treeShakeable: true, reason: 'ESM sub-module imports (date-fns/format)', sideEffects: false },
  { name: 'rxjs', treeShakeable: true, reason: 'ESM with sideEffects: false', sideEffects: false },
  { name: 'lodash', treeShakeable: false, reason: 'CommonJS — require() cannot be tree-shaken', sideEffects: undefined },
  { name: 'moment', treeShakeable: false, reason: 'Monolithic — no ESM build, no sideEffects declaration', sideEffects: undefined },
  { name: 'jquery', treeShakeable: false, reason: 'CommonJS, has side effects (global $)', sideEffects: undefined },
];

export default function TreeShakingDemoPage() {
  const [chunks, setChunks] = useState<ChunkInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResult, setSearchResult] = useState<LibraryCheck | null>(null);

  useEffect(() => {
    const entries = performance.getEntriesByType('resource');
    const jsChunks: ChunkInfo[] = entries
      .filter((e) => e.name.endsWith('.js'))
      .map((e) => ({
        name: e.name.split('/').pop() || 'unknown',
        size: e.transferSize,
        containsTreeShaken: false,
      }));
    setChunks(jsChunks);
  }, []);

  const handleSearch = () => {
    const found = TREE_SHAKEABLE_LIBRARIES.find(
      (lib) => lib.name.toLowerCase() === searchTerm.toLowerCase()
    );
    setSearchResult(found || null);
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Tree Shaking Demo</h1>
      <p className="text-gray-400 mb-8">Verify that only imported code is bundled.</p>

      {/* Bad vs Good Imports Side by Side */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Import Patterns Comparison</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-red-400 mb-3">Bad Patterns (not used in this app)</h3>
            <div className="space-y-2 text-xs font-mono text-gray-400">
              <div>import * as dateFns from &quot;date-fns&quot;</div>
              <div>const _ = require(&quot;lodash&quot;)</div>
              <div>import { fn } from &quot;./barrel&quot;</div>
              <div>import &quot;lib/styles.css&quot;</div>
            </div>
            <div className="mt-3 text-xs text-red-300">
              Estimated: ~170KB bundled (80 + 72 + 15 + 50)
            </div>
          </div>

          <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-green-400 mb-3">Good Patterns (used in this app)</h3>
            <div className="space-y-2 text-xs font-mono text-gray-400">
              <div>import &#123; format &#125; from &quot;date-fns/format&quot;</div>
              <div>import &#123; debounce &#125; from &quot;lodash-es&quot;</div>
              <div>import &#123; add, multiply &#125; from &quot;@/utils/math&quot;</div>
              <div>import &#123; capitalize &#125; from &quot;@/utils/strings&quot;</div>
            </div>
            <div className="mt-3 text-xs text-green-300">
              Estimated: ~6KB bundled (2 + 2 + 1 + 1)
            </div>
          </div>
        </div>
      </section>

      {/* Live Function Calls */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Live Tree-Shaken Functions</h2>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800 space-y-2 text-sm font-mono">
          <div><span className="text-gray-500">format():</span> <span className="text-green-400">{format(new Date(), 'yyyy-MM-dd HH:mm')}</span></div>
          <div><span className="text-gray-500">debounce():</span> <span className="text-green-400">{typeof debounce(() => {}, 300)}</span></div>
          <div><span className="text-gray-500">add(2,3):</span> <span className="text-green-400">{add(2, 3)}</span></div>
          <div><span className="text-gray-500">multiply(4,5):</span> <span className="text-green-400">{multiply(4, 5)}</span></div>
          <div><span className="text-gray-500">capitalize():</span> <span className="text-green-400">{capitalize('hello world')}</span></div>
          <div><span className="text-gray-500">slugify():</span> <span className="text-green-400">{slugify('Hello World! 2024')}</span></div>
          <div><span className="text-gray-500">daysBetween():</span> <span className="text-green-400">{daysBetween(new Date('2024-01-01'), new Date('2024-12-31'))} days</span></div>
        </div>
      </section>

      {/* Chunks Loaded */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Chunks Loaded</h2>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left py-1">Chunk</th>
                <th className="text-right py-1">Size</th>
              </tr>
            </thead>
            <tbody>
              {chunks.map((c, i) => (
                <tr key={i} className="text-gray-300 border-t border-gray-800">
                  <td className="py-1 font-mono truncate max-w-[300px]">{c.name}</td>
                  <td className="text-right py-1 text-yellow-400">{(c.size / 1024).toFixed(1)}KB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Interactive Library Checker */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Library Tree-Shakeability Checker</h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Type a library name (e.g. lodash-es, moment, rxjs)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSearch}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm"
          >
            Check
          </button>
        </div>

        {searchResult && (
          <div className={`rounded-lg p-4 border ${
            searchResult.treeShakeable
              ? 'bg-green-900/20 border-green-800'
              : 'bg-red-900/20 border-red-800'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-3 h-3 rounded-full ${searchResult.treeShakeable ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="font-medium">{searchResult.name}</span>
              <span className={`text-sm ${searchResult.treeShakeable ? 'text-green-400' : 'text-red-400'}`}>
                {searchResult.treeShakeable ? 'Tree-shakeable' : 'NOT tree-shakeable'}
              </span>
            </div>
            <p className="text-sm text-gray-400">{searchResult.reason}</p>
            {searchResult.sideEffects !== undefined && (
              <p className="text-xs text-gray-500 mt-1">
                sideEffects: {searchResult.sideEffects ? 'true' : 'false'}
              </p>
            )}
          </div>
        )}

        {!searchResult && searchTerm && (
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 text-sm text-gray-400">
            Library not in demo database. Try: lodash-es, lodash, date-fns, moment, rxjs, jquery
          </div>
        )}
      </section>
    </main>
  );
}
