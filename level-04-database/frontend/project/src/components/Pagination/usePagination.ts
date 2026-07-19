/**
 * usePagination.ts — Generic pagination hook supporting both modes
 *
 * Provides a unified interface for cursor-based and offset-based pagination.
 * Tracks response times for each navigation to enable performance comparison.
 */

import { useState, useCallback, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface PaginationResult<T> {
  data: T[];
  total?: number;
  nextCursor?: string | null;
}

export interface PaginationState<T> {
  data: T[];
  isLoading: boolean;
  currentPage: number;
  canGoNext: boolean;
  canGoPrev: boolean;
  responseTimes: number[];
  lastResponseTime: number;
}

export type PaginationMode = 'offset' | 'cursor';

interface UsePaginationOptions<T> {
  mode: PaginationMode;
  fetchFn: (params: {
    page?: number;
    cursor?: string;
    limit: number;
  }) => Promise<PaginationResult<T>>;
  limit?: number;
}

// ============================================================================
// Hook
// ============================================================================

export function usePagination<T>(options: UsePaginationOptions<T>): PaginationState<T> & {
  next: () => Promise<void>;
  prev: () => Promise<void>;
  goToPage: (page: number) => Promise<void>;
  goToStart: () => Promise<void>;
  responseTimes: number[];
} {
  const { mode, fetchFn, limit = 20 } = options;

  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [canGoNext, setCanGoNext] = useState(true);
  const [canGoPrev, setCanGoPrev] = useState(false);
  const [responseTimes, setResponseTimes] = useState<number[]>([]);

  const cursorStack = useRef<string[]>([]); // for cursor-back navigation
  const currentCursor = useRef<string | null>(null);

  const loadPage = useCallback(
    async (params: { page?: number; cursor?: string }) => {
      setIsLoading(true);
      const start = performance.now();

      try {
        const result = await fetchFn({ ...params, limit });
        const duration = performance.now() - start;

        setResponseTimes((prev) => [...prev.slice(-99), parseFloat(duration.toFixed(1))]);
        setData(result.data);
        setCanGoNext(mode === 'offset' ? params.page! * limit < (result.total ?? 0) : !!result.nextCursor);
        setCanGoPrev(mode === 'offset' ? params.page! > 1 : cursorStack.current.length > 0);
      } catch {
        // Keep existing data on error
      } finally {
        setIsLoading(false);
      }
    },
    [fetchFn, limit, mode]
  );

  const next = useCallback(async () => {
    if (mode === 'offset') {
      const nextPage = currentPage + 1;
      await loadPage({ page: nextPage });
      setCurrentPage(nextPage);
    } else {
      // Cursor mode: push current cursor to stack, advance
      if (currentCursor.current) {
        cursorStack.current.push(currentCursor.current);
      }
      const nextPage = currentPage + 1;
      await loadPage({ cursor: currentCursor.current ?? undefined });
      setCurrentPage(nextPage);
    }
  }, [mode, currentPage, loadPage]);

  const prev = useCallback(async () => {
    if (mode === 'offset') {
      const prevPage = Math.max(1, currentPage - 1);
      await loadPage({ page: prevPage });
      setCurrentPage(prevPage);
    } else {
      // Cursor mode: pop from stack
      const prevCursor = cursorStack.current.pop();
      currentCursor.current = prevCursor ?? null;
      await loadPage({ cursor: prevCursor ?? undefined });
      setCurrentPage((p) => Math.max(1, p - 1));
    }
  }, [mode, currentPage, loadPage]);

  const goToPage = useCallback(
    async (page: number) => {
      if (mode === 'offset') {
        await loadPage({ page });
        setCurrentPage(page);
      }
    },
    [mode, loadPage]
  );

  const goToStart = useCallback(async () => {
    cursorStack.current = [];
    currentCursor.current = null;
    await loadPage({});
    setCurrentPage(1);
  }, [loadPage]);

  return {
    data,
    isLoading,
    currentPage,
    canGoNext,
    canGoPrev,
    responseTimes,
    lastResponseTime: responseTimes[responseTimes.length - 1] ?? 0,
    next,
    prev,
    goToPage,
    goToStart,
  };
}
