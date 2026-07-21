/**
 * PERFORMANCE CONTEXT HOOK
 *
 * Subscribes to PerformanceObserver entries and maintains a rolling window
 * of the last 30 seconds of data. Provides a getSnapshot() function that
 * returns the current performance state for error boundary capture.
 */

'use client';

import { useRef, useCallback, useEffect } from 'react';

// ─── Performance State Shape ─────────────────────────────────────────────

export interface PerformanceSnapshot {
  lastLCP: { value: number; element: string } | null;
  clsScore: number;
  clsCount: number;
  lastINP: { eventType: string; duration: number } | null;
  longTaskCount: number;
  memoryUsage: { usedJSHeapSize: number; totalJSHeapSize: number } | null;
  timeSinceNavigation: number;
}

// ─── Hook Implementation ─────────────────────────────────────────────────

export function usePerformanceContext() {
  // Rolling window state — refs to avoid re-renders
  const lcpRef = useRef<{ value: number; element: string } | null>(null);
  const clsRef = useRef<{ score: number; count: number }>({ score: 0, count: 0 });
  const inpRef = useRef<{ eventType: string; duration: number } | null>(null);
  const longTasksRef = useRef<Array<{ startTime: number }>>([]);
  const startTimeRef = useRef(performance.now());

  // Subscribe to LCP
  useEffect(() => {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) {
          lcpRef.current = {
            value: last.startTime,
            element: (last as any).element?.tagName || 'unknown',
          };
        }
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
      return () => observer.disconnect();
    } catch { /* observer not supported */ }
  }, []);

  // Subscribe to CLS
  useEffect(() => {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          if (!entry.hadRecentInput) {
            clsRef.current.score += entry.value;
            clsRef.current.count += 1;
          }
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
      return () => observer.disconnect();
    } catch { /* observer not supported */ }
  }, []);

  // Subscribe to INP
  useEffect(() => {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          inpRef.current = {
            eventType: entry.name || 'unknown',
            duration: entry.duration,
          };
        }
      });
      observer.observe({ type: 'event', buffered: false });
      return () => observer.disconnect();
    } catch { /* observer not supported */ }
  }, []);

  // Subscribe to long tasks
  useEffect(() => {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasksRef.current.push({ startTime: entry.startTime });
        }
      });
      observer.observe({ type: 'longtask', buffered: false });
      return () => observer.disconnect();
    } catch { /* observer not supported */ }
  }, []);

  // Snapshot function — called by error boundary
  const getSnapshot = useCallback((): PerformanceSnapshot => {
    const now = performance.now();
    const thirtySecondsAgo = now - 30_000;

    // Count long tasks in last 30 seconds
    const recentLongTasks = longTasksRef.current.filter(
      (t) => t.startTime > thirtySecondsAgo
    );
    longTasksRef.current = recentLongTasks;

    // Memory usage (Chrome only)
    const memory = (performance as any).memory
      ? {
          usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
          totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
        }
      : null;

    return {
      lastLCP: lcpRef.current,
      clsScore: clsRef.current.score,
      clsCount: clsRef.current.count,
      lastINP: inpRef.current,
      longTaskCount: recentLongTasks.length,
      memoryUsage: memory,
      timeSinceNavigation: now - startTimeRef.current,
    };
  }, []);

  return { getSnapshot };
}
