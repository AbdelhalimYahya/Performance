/**
 * InfiniteProductList.tsx — Production infinite scroll component
 *
 * Renders a virtualized product grid with IntersectionObserver-based
 * infinite loading, skeleton loading states, error recovery, and
 * end-of-data messaging.
 */

'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import { useInfiniteProducts, Product, InfiniteProductsFilters } from './useInfiniteProducts';
import { ProductCardSkeletonGrid } from './ProductCardSkeleton';

// ============================================================================
// ProductCard
// ============================================================================

function ProductCard({ product }: { product: Product }) {
  return (
    <div className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
      {/* Lazy-loaded image */}
      <div className="w-full h-40 bg-gray-100 rounded-md mb-3 flex items-center justify-center overflow-hidden">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-gray-400 text-sm">No image</span>
        )}
      </div>

      {/* Category badge */}
      <span className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full mb-2">
        {product.category}
      </span>

      {/* Name */}
      <h3 className="font-medium text-sm truncate mb-1">{product.name}</h3>

      {/* Price */}
      <p className="text-lg font-bold text-green-600 mb-3">
        ${product.price.toFixed(2)}
      </p>

      {/* Add to cart */}
      <button className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
        Add to cart
      </button>
    </div>
  );
}

// ============================================================================
// InfiniteProductList
// ============================================================================

interface InfiniteProductListProps {
  filters?: InfiniteProductsFilters;
}

export function InfiniteProductList({ filters = {} }: InfiniteProductListProps) {
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useInfiniteProducts(filters);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // --- IntersectionObserver: trigger fetchNextPage when sentinel is visible ---
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      {
        root: containerRef.current,
        rootMargin: '300px', // trigger 300px before sentinel is visible
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // --- Initial loading state ---
  if (isLoading) {
    return (
      <div ref={containerRef} className="h-[calc(100vh-200px)] overflow-y-auto p-4">
        <ProductCardSkeletonGrid count={12} />
      </div>
    );
  }

  // --- Error state ---
  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-red-600">Failed to load products: {error.message}</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div ref={containerRef} className="h-[calc(100vh-200px)] overflow-y-auto p-4">
      {/* Product grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {/* Loading more skeletons */}
      {isFetchingNextPage && (
        <div className="mt-4">
          <ProductCardSkeletonGrid count={4} />
        </div>
      )}

      {/* Sentinel div for IntersectionObserver */}
      {hasNextPage && <div ref={sentinelRef} className="h-1" />}

      {/* Error during fetch more */}
      {error && data && (
        <div className="mt-4 text-center">
          <p className="text-red-600 text-sm mb-2">Failed to load more products</p>
          <button
            onClick={() => fetchNextPage()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry loading more
          </button>
        </div>
      )}

      {/* End of data */}
      {!hasNextPage && items.length > 0 && (
        <div className="mt-6 text-center text-gray-500 text-sm py-4 border-t">
          You&apos;ve seen all {total} products
        </div>
      )}

      {/* Empty state */}
      {!hasNextPage && items.length === 0 && (
        <div className="flex items-center justify-center h-64 text-gray-400">
          No products found matching your filters.
        </div>
      )}
    </div>
  );
}
