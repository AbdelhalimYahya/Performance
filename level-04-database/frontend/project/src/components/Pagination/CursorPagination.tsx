/**
 * CursorPagination.tsx — Cursor-based pagination with stable performance graph
 *
 * Demonstrates that cursor pagination maintains consistent response times
 * regardless of depth. The CSS bar graph shows flat bars (all ~same time).
 */

'use client';

import { usePagination } from './usePagination';

// ============================================================================
// Mock fetcher for demo
// ============================================================================

async function fetchCursorProducts({ cursor, limit }: { cursor?: string; limit: number }) {
  // Simulate: cursor pagination is always fast (index seek, not scan)
  await new Promise((r) => setTimeout(r, 50 + Math.random() * 20));

  const startId = cursor ? parseInt(cursor.split('-').pop() ?? '0', 10) : 0;
  const total = 2000;
  const remaining = total - startId;
  const count = Math.min(limit, remaining);

  return {
    data: Array.from({ length: count }, (_, i) => ({
      id: `prod-${startId + i + 1}`,
      name: `Product ${startId + i + 1}`,
    })),
    total,
    nextCursor: startId + count < total ? `cursor-${startId + count}` : null,
  };
}

// ============================================================================
// Component
// ============================================================================

export function CursorPagination() {
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
  } = usePagination({
    mode: 'cursor',
    fetchFn: fetchCursorProducts,
    limit: 20,
  });

  const maxTime = Math.max(...responseTimes, 1);

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Cursor Pagination</h3>
        <div className="text-xs text-gray-500">
          Step {currentPage} · {lastResponseTime.toFixed(0)}ms
        </div>
      </div>

      {/* Response time graph — should show consistent heights */}
      {responseTimes.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 rounded">
          <div className="text-xs font-medium text-gray-500 mb-2">
            Response time per step (stable = consistent)
          </div>
          <div className="flex items-end gap-0.5 h-16">
            {responseTimes.map((t, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-green-500"
                style={{
                  height: `${(t / maxTime) * 100}%`,
                }}
                title={`Step ${i + 1}: ${t.toFixed(0)}ms`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>Step 1</span>
            <span>Step {responseTimes.length}</span>
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

      {/* Prev/Next only — no page numbers */}
      <div className="flex items-center justify-between">
        <button
          onClick={prev}
          disabled={!canGoPrev || isLoading}
          className="px-3 py-1 text-sm border rounded disabled:opacity-50"
        >
          ← Previous
        </button>

        <span className="text-xs text-gray-400">Step {currentPage}</span>

        <button
          onClick={next}
          disabled={!canGoNext || isLoading}
          className="px-3 py-1 text-sm border rounded disabled:opacity-50"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
