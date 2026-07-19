/**
 * infinite-scroll/page.tsx — Demo page for InfiniteProductList
 *
 * Renders the infinite scroll component with filter controls
 * for category, sort order, and price range.
 */

'use client';

import { useState } from 'react';
import { InfiniteProductList } from '@/components/InfiniteProductList/InfiniteProductList';
import { InfiniteProductsFilters } from '@/components/InfiniteProductList/useInfiniteProducts';

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'home', label: 'Home' },
  { value: 'sports', label: 'Sports' },
  { value: 'books', label: 'Books' },
];

const SORT_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'name', label: 'Name A-Z' },
  { value: 'createdAt', label: 'Newest First' },
];

export default function InfiniteScrollPage() {
  const [filters, setFilters] = useState<InfiniteProductsFilters>({});

  return (
    <main className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Infinite Scroll Products</h1>

      {/* Filter controls */}
      <div className="flex flex-wrap gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        {/* Category */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
          <select
            value={filters.category ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                category: e.target.value || undefined,
              }))
            }
            className="px-3 py-2 border rounded text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Sort */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Sort by</label>
          <select
            value={filters.sort ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                sort: e.target.value || undefined,
              }))
            }
            className="px-3 py-2 border rounded text-sm"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Price range */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Min Price</label>
          <input
            type="number"
            placeholder="0"
            value={filters.minPrice ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                minPrice: e.target.value ? Number(e.target.value) : undefined,
              }))
            }
            className="w-24 px-3 py-2 border rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Max Price</label>
          <input
            type="number"
            placeholder="999"
            value={filters.maxPrice ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                maxPrice: e.target.value ? Number(e.target.value) : undefined,
              }))
            }
            className="w-24 px-3 py-2 border rounded text-sm"
          />
        </div>

        {/* Reset */}
        <div className="flex items-end">
          <button
            onClick={() => setFilters({})}
            className="px-4 py-2 text-sm text-gray-600 border rounded hover:bg-gray-100"
          >
            Reset filters
          </button>
        </div>
      </div>

      {/* Infinite scroll list */}
      <InfiniteProductList filters={filters} />
    </main>
  );
}
