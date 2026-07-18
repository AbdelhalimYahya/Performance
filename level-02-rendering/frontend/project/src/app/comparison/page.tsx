import { Suspense } from 'react';
import { PerformanceMeter } from './PerformanceMeter';
import { CSRColumn } from './CSRColumn';

// ============================================================================
// SSG Column — Server Component with static data (build time)
// ============================================================================

async function generateStaticData() {
  return Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    name: `Product ${i + 1}`,
    category: ['Electronics', 'Clothing', 'Home', 'Sports'][i % 4],
    price: Math.round((Math.random() * 500 + 10) * 100) / 100,
  }));
}

const staticProducts = await generateStaticData();
const buildTimestamp = new Date().toISOString();

function SSGColumn() {
  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <h2 className="text-lg font-bold text-green-400 mb-2">Static (SSG)</h2>
      <p className="text-xs text-gray-500 mb-4">
        Data fetched at build time. Timestamp never changes.
      </p>
      <div className="bg-gray-800 rounded p-3 mb-4">
        <p className="text-sm text-gray-300">
          Rendered at: <span className="font-mono text-green-300">{buildTimestamp}</span>
        </p>
        <p className="text-xs text-gray-500 mt-1">
          This HTML is pre-built and served from CDN cache
        </p>
      </div>
      <div className="space-y-2 max-h-80 overflow-auto">
        {staticProducts.map((p) => (
          <div key={p.id} className="flex justify-between text-sm py-1 border-b border-gray-800">
            <span className="text-gray-300">{p.name}</span>
            <span className="text-gray-500">${p.price}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// SSR Column — Server Component with dynamic data (request time)
// ============================================================================

async function fetchServerData() {
  const start = performance.now();
  const products = Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    name: `Product ${i + 1}`,
    category: ['Electronics', 'Clothing', 'Home', 'Sports'][i % 4],
    price: Math.round((Math.random() * 500 + 10) * 100) / 100,
  }));
  const duration = performance.now() - start;
  return { products, duration };
}

async function SSRColumn() {
  const { products, duration } = await fetchServerData();
  const requestTimestamp = new Date().toISOString();

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <h2 className="text-lg font-bold text-blue-400 mb-2">Server-Side (SSR)</h2>
      <p className="text-xs text-gray-500 mb-4">
        Data fetched on every request. Timestamp updates each load.
      </p>
      <div className="bg-gray-800 rounded p-3 mb-4">
        <p className="text-sm text-gray-300">
          Rendered at: <span className="font-mono text-blue-300">{requestTimestamp}</span>
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Server render time: {duration.toFixed(2)}ms
        </p>
      </div>
      <div className="space-y-2 max-h-80 overflow-auto">
        {products.map((p) => (
          <div key={p.id} className="flex justify-between text-sm py-1 border-b border-gray-800">
            <span className="text-gray-300">{p.name}</span>
            <span className="text-gray-500">${p.price}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Comparison Page
// ============================================================================

export default async function ComparisonPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Rendering Strategy Comparison</h1>
        <p className="text-gray-400 mb-8">
          See SSR, SSG, and CSR side by side. Refresh the page to see how each strategy differs.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <SSGColumn />
          <Suspense fallback={
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h2 className="text-lg font-bold text-blue-400 mb-2">Server-Side (SSR)</h2>
              <div className="animate-pulse space-y-3">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="h-8 bg-gray-800 rounded" />
                ))}
              </div>
            </div>
          }>
            <SSRColumn />
          </Suspense>
          <CSRColumn />
        </div>

        <PerformanceMeter />
      </div>
    </div>
  );
}
