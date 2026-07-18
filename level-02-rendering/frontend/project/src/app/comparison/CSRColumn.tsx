'use client';

import { useState, useEffect } from 'react';

interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
}

function SkeletonRow() {
  return (
    <div className="animate-pulse flex justify-between py-1 border-b border-gray-800">
      <div className="h-4 bg-gray-800 rounded w-32" />
      <div className="h-4 bg-gray-800 rounded w-12" />
    </div>
  );
}

/**
 * Client-Side CSR Column.
 * Fetches data on mount with useEffect, showing a skeleton while loading.
 * Measures and displays time from mount to data displayed.
 */
export function CSRColumn() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [mountTime, setMountTime] = useState(0);
  const [fetchTime, setFetchTime] = useState(0);

  useEffect(() => {
    const mountStart = performance.now();
    setMountTime(mountStart);

    fetch('/api/data?delay=100')
      .then((r) => r.json())
      .then((data: Product[]) => {
        setProducts(data.slice(0, 20));
        setFetchTime(performance.now() - mountStart);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <h2 className="text-lg font-bold text-yellow-400 mb-2">Client-Side (CSR)</h2>
      <p className="text-xs text-gray-500 mb-4">
        Empty HTML on server. Data fetched after JavaScript loads.
      </p>
      <div className="bg-gray-800 rounded p-3 mb-4">
        {loading ? (
          <p className="text-sm text-gray-400">Loading data...</p>
        ) : (
          <>
            <p className="text-sm text-gray-300">
              Mount to data: <span className="font-mono text-yellow-300">{fetchTime.toFixed(0)}ms</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Includes: JS parse + execute + network request
            </p>
          </>
        )}
      </div>
      <div className="space-y-2 max-h-80 overflow-auto">
        {loading ? (
          Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)
        ) : (
          products.map((p) => (
            <div key={p.id} className="flex justify-between text-sm py-1 border-b border-gray-800">
              <span className="text-gray-300">{p.name}</span>
              <span className="text-gray-500">${p.price}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
