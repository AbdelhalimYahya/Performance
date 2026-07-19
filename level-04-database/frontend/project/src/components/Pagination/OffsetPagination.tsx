/**
 * OffsetPagination.tsx — Standard offset-based pagination with performance graph
 *
 * Demonstrates that offset pagination gets slower as page number increases.
 * Shows a CSS bar graph of response times per page.
 */

'use client';

import { usePagination } from './usePagination';

// ============================================================================
// Mock fetcher for demo
// ============================================================================

async function fetchOffsetProducts({ page, limit }: { page?: number; limit: number }) {
  // Simulate: higher pages are slower (offset scan penalty)
  const simulatedDelay = 50 + (page ?? 1) * 8;
  await new Promise((r) => setTimeout(r, simulatedDelay));

  const total = 2000;
  return {
    data: Array.from({ length: limit }, (_, i) => ({
      id: `prod-${((page! - 1) * limit) + i + 1}`,
      name: `Product ${((page! - 1) * limit) + i + 1}`,
    })),
    total,
  };
}

// ============================================================================
// Component
// ============================================================================

export function OffsetPagination() {
  const {
    data,
    isLoading,
    currentPage,
    canGoNext,
    canGoPrev,
    responseTimes,
    lastResponseTime,
    next,
    prev,
    goToPage,
  } = usePagination({
    mode: 'offset',
    fetchFn: fetchOffsetProducts,
    limit: 20,
  });

  const maxTime = Math.max(...responseTimes, 1);

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Offset Pagination</h3>
        <div className="text-xs text-gray-500">
          Page {currentPage} · {lastResponseTime.toFixed(0)}ms
        </div>
      </div>

      {/* Response time graph */}
      {responseTimes.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 rounded">
          <div className="text-xs font-medium text-gray-500 mb-2">
            Response time by page (higher = slower)
          </div>
          <div className="flex items-end gap-0.5 h-16">
            {responseTimes.map((t, i) => (
              <div
                key={i}
                className="flex-1 rounded-t"
                style={{
                  height: `${(t / maxTime) * 100}%`,
                  backgroundColor: t > 200 ? '#ef4444' : t > 100 ? '#f59e0b' : '#22c55e',
                }}
                title={`Page ${i + 1}: ${t.toFixed(0)}ms`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>Page 1</span>
            <span>Page {responseTimes.length}</span>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="space-y-1 mb-4 min-h-[200px]">
        {isLoading ? (
          <div className="text-center text-gray-400 py-8">Loading...</div>
        ) : (
          data.map((item: any) => (
            <div key={item.id} className="px-3 py-1 text-sm border-b">
              {item.name}
            </div>
          ))
        )}
      </div>

      {/* Page navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={prev}
          disabled={!canGoPrev || isLoading}
          className="px-3 py-1 text-sm border rounded disabled:opacity-50"
        >
          Prev
        </button>

        <div className="flex gap-1">
          {Array.from({ length: 5 }, (_, i) => {
            const page = Math.max(1, currentPage - 2) + i;
            return (
              <button
                key={page}
                onClick={() => goToPage(page)}
                className={`px-2 py-1 text-xs rounded ${
                  page === currentPage ? 'bg-blue-600 text-white' : 'border hover:bg-gray-100'
                }`}
              >
                {page}
              </button>
            );
          })}
          <span className="px-2 py-1 text-xs text-gray-400">...</span>
          <button
            onClick={() => goToPage(100)}
            className="px-2 py-1 text-xs border hover:bg-gray-100"
          >
            100
          </button>
        </div>

        <button
          onClick={next}
          disabled={!canGoNext || isLoading}
          className="px-3 py-1 text-sm border rounded disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
