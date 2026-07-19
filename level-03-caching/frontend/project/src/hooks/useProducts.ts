/**
 * useProducts.ts — React Query hooks demonstrating all caching patterns
 *
 * Every hook follows the same structure:
 *   1. Type definitions
 *   2. Query key usage via the hierarchical factory
 *   3. Cache strategy (keepPreviousData, placeholderData, initialData, etc.)
 *   4. Optimistic updates where mutations are involved
 *   5. JSDoc explaining the "why" behind each decision
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { products as productKeys } from '@/lib/query-keys';

// ============================================================================
// Types
// ============================================================================

/** Product as returned by the API. */
export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  isActive: boolean;
  tags: string[];
  createdAt: string;
}

/** Computed fields added by the select transform. */
export interface ProductWithComputed extends Product {
  /** Price formatted as a locale-aware currency string. */
  formattedPrice: string;
  /** Discount percentage off the original list price (simulated). */
  discountPercent: number;
}

/** Filters accepted by the product list endpoint. */
export interface ProductFilters {
  page?: number;
  limit?: number;
  category?: string;
  sort?: 'price-asc' | 'price-desc' | 'name' | 'createdAt';
}

/** Paginated response wrapper. */
export interface ProductListResponse {
  data: Product[];
  total: number;
  page: number;
  limit: number;
}

/** Payload for creating a new product. */
export interface CreateProductInput {
  name: string;
  category: string;
  price: number;
  stock: number;
  isActive?: boolean;
  tags?: string[];
}

/** Payload for updating an existing product. */
export interface UpdateProductInput extends Partial<CreateProductInput> {
  id: string;
}

// ============================================================================
// Constants
// ============================================================================

const LIST_STALE_TIME = 60_000;   // 1 minute
const DETAIL_STALE_TIME = 120_000; // 2 minutes — details change less often

// ============================================================================
// useProducts — Paginated list with keepPreviousData
// ============================================================================

/**
 * Fetches a paginated list of products.
 *
 * Key caching decisions:
 *   - `keepPreviousData: true` — the old page stays visible while the next
 *     page loads, eliminating the loading flicker on page/filter change.
 *   - `select` — transforms raw API data to add computed fields (formatted
 *     price, discount). This runs every time the data changes but is memoized
 *     by React Query, so downstream components only re-render when the
 *     computed values actually change.
 *   - `placeholderData: keepPreviousData` — re-exported for v5 compatibility.
 */
export function useProducts(filters: ProductFilters) {
  return useQuery<ProductListResponse, Error, { items: ProductWithComputed[]; total: number }>({
    queryKey: productKeys.list(filters as Record<string, unknown>),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));
      if (filters.category) params.set('category', filters.category);
      if (filters.sort) params.set('sort', filters.sort);

      const res = await fetch(`/api/v1/products?${params}`, { signal });
      if (!res.ok) throw Object.assign(new Error('Failed to fetch products'), { status: res.status });
      return res.json();
    },

    // Keep previous data visible while new data loads (no loading spinner).
    placeholderData: (prev) => prev,

    staleTime: LIST_STALE_TIME,

    // Transform: add computed fields without changing the original shape.
    select: (raw) => ({
      items: raw.data.map((p) => ({
        ...p,
        formattedPrice: new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(p.price),
        discountPercent: Math.round((1 - p.price / (p.price * 1.3)) * 100),
      })),
      total: raw.total,
    }),
  });
}

// ============================================================================
// useProduct — Single detail with initialData from list cache
// ============================================================================

/**
 * Fetches a single product by ID.
 *
 * Key caching decisions:
 *   - `initialData` — if the product already exists in a list query cache,
 *     use it immediately. This avoids a flash of loading state when navigating
 *     from a list to a detail page.
 *   - `initialDataUpdatedAt` — tells React Query *when* that list data was
 *     fetched, so it can correctly apply staleTime. Without this, React Query
 *     would treat the initialData as "fetched now" and never refetch.
 *   - `enabled: !!id` — never fire a request if the ID is falsy.
 */
export function useProduct(id: string) {
  const queryClient = useQueryClient();

  return useQuery<Product, Error>({
    queryKey: productKeys.detail(id),
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/v1/products/${id}`, { signal });
      if (!res.ok) throw Object.assign(new Error('Failed to fetch product'), { status: res.status });
      return res.json();
    },

    // Pull from the first matching list cache if available.
    initialData: () => {
      // Search all list query caches for a product with this ID
      const listQueries = queryClient.getQueriesData<ProductListResponse>({
        queryKey: productKeys.lists(),
      });

      for (const [key, data] of listQueries) {
        if (!data) continue;
        const found = data.data.find((p) => p.id === id);
        if (found) return found;
      }
      return undefined; // no initialData — will fetch from network
    },

    // Respect the list query's staleness so we refetch at the right time.
    initialDataUpdatedAt: () => {
      const query = queryClient.getQueryCache().find({
        queryKey: productKeys.lists(),
      });
      return query?.state.dataUpdatedAt ?? 0;
    },

    enabled: !!id,
    staleTime: DETAIL_STALE_TIME,
  });
}

// ============================================================================
// useCreateProduct — Optimistic insert into list cache
// ============================================================================

/**
 * Creates a new product with an optimistic update.
 *
 * Flow:
 *   1. onMutate — immediately add a "phantom" product to the list cache.
 *   2. The UI shows the new item instantly (with a temporary ID).
 *   3. onSuccess — replace the phantom with the real server response.
 *   4. onError — roll back to the snapshot, show a toast.
 *   5. onSettled — invalidate to sync any other views.
 */
export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation<Product, Error, CreateProductInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw Object.assign(new Error('Failed to create product'), { status: res.status });
      return res.json();
    },

    // --- Optimistic update ---
    onMutate: async (newProduct) => {
      // 1. Cancel any in-flight list queries so they don't overwrite our update.
      await queryClient.cancelQueries({ queryKey: productKeys.lists() });

      // 2. Snapshot the current list data for rollback.
      const previousLists = queryClient.getQueriesData<ProductListResponse>({
        queryKey: productKeys.lists(),
      });

      // 3. Optimistically add the new product to every list cache.
      queryClient.setQueriesData<ProductListResponse>(
        { queryKey: productKeys.lists() },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: [
              {
                ...newProduct,
                id: `temp-${Date.now()}`,
                isActive: newProduct.isActive ?? true,
                tags: newProduct.tags ?? [],
                createdAt: new Date().toISOString(),
              } as Product,
              ...old.data,
            ],
            total: old.total + 1,
          };
        },
      );

      return { previousLists };
    },

    // --- Rollback on error ---
    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          queryClient.setQueryData(key, data);
        }
      }
      // In production: toast.error('Failed to create product');
    },

    // --- Replace optimistic data with real response ---
    onSuccess: (serverProduct) => {
      queryClient.setQueriesData<ProductListResponse>(
        { queryKey: productKeys.lists() },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((p) =>
              p.id.startsWith('temp-') ? serverProduct : p,
            ),
          };
        },
      );
    },

    // --- Always sync with server ---
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

// ============================================================================
// useUpdateProduct — Optimistic update for single item in list + detail
// ============================================================================

/**
 * Updates a product with optimistic cache patches.
 *
 * Unlike useCreateProduct, this hook must update two cache locations:
 *   1. The detail cache for this specific product
 *   2. Every list cache that contains this product
 */
export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation<Product, Error, UpdateProductInput>({
    mutationFn: async ({ id, ...patch }) => {
      const res = await fetch(`/api/v1/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw Object.assign(new Error('Failed to update product'), { status: res.status });
      return res.json();
    },

    onMutate: async ({ id, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: productKeys.detail(id) });
      await queryClient.cancelQueries({ queryKey: productKeys.lists() });

      const previousDetail = queryClient.getQueryData<Product>(productKeys.detail(id));
      const previousLists = queryClient.getQueriesData<ProductListResponse>({
        queryKey: productKeys.lists(),
      });

      // Optimistically patch the detail cache
      queryClient.setQueryData<Product>(productKeys.detail(id), (old) =>
        old ? { ...old, ...patch } : old,
      );

      // Optimistically patch every list cache that contains this product
      queryClient.setQueriesData<ProductListResponse>(
        { queryKey: productKeys.lists() },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          };
        },
      );

      return { previousDetail, previousLists };
    },

    onError: (_err, { id }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(productKeys.detail(id), context.previousDetail);
      }
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          queryClient.setQueryData(key, data);
        }
      }
    },

    onSuccess: (serverProduct, { id }) => {
      // Replace optimistic data with the real server response
      queryClient.setQueryData(productKeys.detail(id), serverProduct);
      queryClient.setQueriesData<ProductListResponse>(
        { queryKey: productKeys.lists() },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((p) => (p.id === id ? serverProduct : p)),
          };
        },
      );
    },

    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: productKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

// ============================================================================
// useDeleteProduct — Optimistic removal
// ============================================================================

/**
 * Deletes a product with an optimistic removal from the list cache.
 *
 * The detail cache entry is removed on success to prevent stale data
 * from being served if the user navigates to the detail page later.
 */
export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/v1/products/${id}`, { method: 'DELETE' });
      if (!res.ok) throw Object.assign(new Error('Failed to delete product'), { status: res.status });
    },

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: productKeys.lists() });

      const previousLists = queryClient.getQueriesData<ProductListResponse>({
        queryKey: productKeys.lists(),
      });

      // Optimistically remove from all list caches
      queryClient.setQueriesData<ProductListResponse>(
        { queryKey: productKeys.lists() },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.filter((p) => p.id !== id),
            total: old.total - 1,
          };
        },
      );

      return { previousLists };
    },

    onError: (_err, _id, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          queryClient.setQueryData(key, data);
        }
      }
    },

    onSuccess: (_data, id) => {
      // Remove the detail cache entry entirely
      queryClient.removeQueries({ queryKey: productKeys.detail(id) });
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.all() });
    },
  });
}

// ============================================================================
// usePrefetchProduct — Prefetch on hover
// ============================================================================

/**
 * Returns a prefetch function to be called on mouse enter / focus.
 *
 * Key caching decisions:
 *   - `staleTime` is set to 5 minutes — if data is already in cache and
 *     fresh, no request is made. This prevents over-prefetching.
 *   - `throwOnError: false` — prefetch failures are silent (the user will
 *     see a loading state on navigation instead of an error).
 */
export function usePrefetchProduct(id: string) {
  const queryClient = useQueryClient();

  return () => {
    queryClient.prefetchQuery({
      queryKey: productKeys.detail(id),
      queryFn: async ({ signal }) => {
        const res = await fetch(`/api/v1/products/${id}`, { signal });
        if (!res.ok) throw new Error('Prefetch failed');
        return res.json();
      },
      staleTime: 5 * 60 * 1000, // 5 minutes — don't re-prefetch if fresh
      throwOnError: false,        // silent failure — not a user-facing error
    });
  };
}
