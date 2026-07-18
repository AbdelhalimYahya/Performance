'use client';

import React, { useState, useRef, useCallback, useMemo, Profiler, ProfilerOnRenderCallback, ReactNode } from 'react';

// ============================================================================
// Types
// ============================================================================

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number;
  onEndReached?: () => void;
  endReachedThreshold?: number;
}

interface VariableVirtualListProps<T> {
  items: T[];
  getItemHeight: (index: number) => number;
  containerHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number;
  onEndReached?: () => void;
  endReachedThreshold?: number;
}

interface VirtualListStats {
  renderedItemCount: number;
  totalItems: number;
  renderTime: number;
}

// ============================================================================
// Fixed-Height Virtual List
// ============================================================================

export function VirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 3,
  onEndReached,
  endReachedThreshold = 200,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<VirtualListStats>({
    renderedItemCount: 0,
    totalItems: items.length,
    renderTime: 0,
  });

  const { startIndex, endIndex, totalHeight, offsetY, visibleCount } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const rawEnd = Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan;
    const end = Math.min(items.length - 1, rawEnd);

    return {
      startIndex: start,
      endIndex: end,
      totalHeight: items.length * itemHeight,
      offsetY: start * itemHeight,
      visibleCount: end - start + 1,
    };
  }, [scrollTop, itemHeight, containerHeight, items.length, overscan]);

  const visibleItems = useMemo(() => {
    const result: { key: number; element: ReactNode }[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      result.push({
        key: i,
        element: renderItem(items[i], i),
      });
    }
    return result;
  }, [items, startIndex, endIndex, renderItem]);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const newScrollTop = containerRef.current.scrollTop;
      setScrollTop(newScrollTop);

      // Check if end reached
      if (onEndReached) {
        const scrollBottom = newScrollTop + containerHeight;
        if (scrollBottom >= totalHeight - endReachedThreshold) {
          onEndReached();
        }
      }
    }
  }, [containerHeight, totalHeight, onEndReached, endReachedThreshold]);

  const onRender: ProfilerOnRenderCallback = useCallback((_id, _phase, actualDuration) => {
    setStats({
      renderedItemCount: visibleCount,
      totalItems: items.length,
      renderTime: actualDuration,
    });
  }, [visibleCount, items.length]);

  return (
    <div className="relative">
      <Profiler id="VirtualList" onRender={onRender}>
        <div
          ref={containerRef}
          onScroll={handleScroll}
          style={{ height: containerHeight, overflow: 'auto' }}
          className="border border-gray-700 rounded bg-gray-950"
        >
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ transform: `translateY(${offsetY}px)` }}>
              {visibleItems.map(({ key, element }) => (
                <div key={key} style={{ height: itemHeight }}>
                  {element}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Profiler>
    </div>
  );
}

// ============================================================================
// Variable-Height Virtual List
// ============================================================================

/**
 * Binary search to find the first item index whose cumulative offset >= scrollTop.
 */
function findStartIndex(
  offsets: number[],
  scrollTop: number,
  low = 0,
  high?: number
): number {
  const end = high ?? offsets.length - 1;
  if (low >= end) return low;

  const mid = Math.floor((low + end) / 2);
  if (offsets[mid] <= scrollTop) {
    return findStartIndex(offsets, scrollTop, mid + 1, end);
  }
  return findStartIndex(offsets, scrollTop, low, mid);
}

export function VariableVirtualList<T>({
  items,
  getItemHeight,
  containerHeight,
  renderItem,
  overscan = 3,
  onEndReached,
  endReachedThreshold = 200,
}: VariableVirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const offsetsRef = useRef<number[]>([]);
  const [stats, setStats] = useState<VirtualListStats>({
    renderedItemCount: 0,
    totalItems: items.length,
    renderTime: 0,
  });

  // Pre-compute cumulative offsets
  const { offsets, totalHeight } = useMemo(() => {
    const offs: number[] = [0];
    let cumulative = 0;
    for (let i = 0; i < items.length; i++) {
      cumulative += getItemHeight(i);
      offs.push(cumulative);
    }
    offsetsRef.current = offs;
    return { offsets: offs, totalHeight: cumulative };
  }, [items, getItemHeight]);

  const { startIndex, endIndex, offsetY, visibleCount } = useMemo(() => {
    const rawStart = findStartIndex(offsets, scrollTop);
    const start = Math.max(0, rawStart - overscan);

    let cumHeight = offsets[start];
    let end = start;
    while (end < items.length - 1 && offsets[end + 1] < scrollTop + containerHeight) {
      end++;
    }
    end = Math.min(items.length - 1, end + overscan);

    return {
      startIndex: start,
      endIndex: end,
      offsetY: offsets[start],
      visibleCount: end - start + 1,
    };
  }, [scrollTop, containerHeight, offsets, items.length, overscan]);

  const visibleItems = useMemo(() => {
    const result: { key: number; height: number; element: ReactNode }[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      result.push({
        key: i,
        height: getItemHeight(i),
        element: renderItem(items[i], i),
      });
    }
    return result;
  }, [items, startIndex, endIndex, renderItem, getItemHeight]);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const newScrollTop = containerRef.current.scrollTop;
      setScrollTop(newScrollTop);

      if (onEndReached) {
        if (newScrollTop + containerHeight >= totalHeight - endReachedThreshold) {
          onEndReached();
        }
      }
    }
  }, [containerHeight, totalHeight, onEndReached, endReachedThreshold]);

  const onRender: ProfilerOnRenderCallback = useCallback((_id, _phase, actualDuration) => {
    setStats({
      renderedItemCount: visibleCount,
      totalItems: items.length,
      renderTime: actualDuration,
    });
  }, [visibleCount, items.length]);

  return (
    <div className="relative">
      <Profiler id="VariableVirtualList" onRender={onRender}>
        <div
          ref={containerRef}
          onScroll={handleScroll}
          style={{ height: containerHeight, overflow: 'auto' }}
          className="border border-gray-700 rounded bg-gray-950"
        >
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ transform: `translateY(${offsetY}px)` }}>
              {visibleItems.map(({ key, height: h, element }) => (
                <div key={key} style={{ height: h }}>
                  {element}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Profiler>
    </div>
  );
}

// ============================================================================
// Debug Overlay
// ============================================================================

export function VirtualListDebug({ stats }: { stats: VirtualListStats }) {
  return (
    <div className="absolute top-0 left-0 bg-black/80 text-green-400 text-xs font-mono p-2 rounded-br z-20">
      <div>Rendered: {stats.renderedItemCount} / {stats.totalItems}</div>
      <div>Render: {stats.renderTime.toFixed(2)}ms</div>
    </div>
  );
}
