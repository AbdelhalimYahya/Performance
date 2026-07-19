/**
 * useInfiniteProducts.ts — Cursor-based infinite query for products
 *
 * Uses useInfiniteQuery with cursor-based pagination. The select transform
 * flattens all pages into a single items array and deduplicates by id.
 *
 * API contract:
 *   GET /api/products?cursor={cursor}&limit=20&category={cat}&sort={sort}
 *   Response: { items: Product[], nextCursor: string | null, total: number }
 */

import { useInfiniteQuery } from '@tanstack/react-query';

// ============================================================================
// Types
// ============================================================================

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  image?: string;
}

export interface ProductPage {
  items: Product[];
  nextCursor: string | null;
  total: number;
}

export interface InfiniteProductsFilters {
  category?: string;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
}

// ============================================================================
// Hook
// ============================================================================

export function useInfiniteProducts(filters: InfiniteProductsFilters = {}) {
  return useInfiniteQuery<
    ProductPage,
    Error,
    { items: Product[]; total: number; flatLength: number }
  >({
    queryKey: ['infinite-products', filters],
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '20' });
      if (pageParam) params.set('cursor', pageParam as string);
      if (filters.category) params.set('category', filters.category);
      if (filters.sort) params.set('sort', filters.sort);
      if (filters.minPrice) params.set('minPrice', String(filters.minPrice));
      if (filters.maxPrice) params.set('maxPrice', String(filters.maxPrice));

      const res = await fetch(`/api/products?${params}`, { signal });
      if (!res.ok) throw new Error(`Failed to fetch products: ${res.status}`);
      return res.json();
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,

    staleTime: 5 * 60_000,  // 5 minutes — data is fresh
    gcTime: 30 * 60_000,     // 30 minutes — keep in memory after unmount

    // Flatten all pages and deduplicate by id
    select: (data) => {
      const seen = new Set<string>();
      const items: Product[] = [];

      for (const page of data.pages) {
        for (const item of page.items) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            items.push(item);
          }
        }
      }

      const lastPage = data.pages[data.pages.length - 1];
      return {
        items,
        total: lastPage?.total ?? 0,
        flatLength: items.length,
      };
    },
  });
}
