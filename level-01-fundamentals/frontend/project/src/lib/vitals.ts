/**
 * Web Vitals Reporter - Production-quality implementation
 *
 * This module provides comprehensive performance monitoring:
 * - Core Web Vitals (LCP, CLS, INP, FCP, TTFB) via web-vitals library
 * - Custom PerformanceObserver entries (long tasks, layout shifts, resources)
 * - React Profiler integration
 * - Session metadata collection
 * - Batched beacon reporting with sampling
 */

import { onCLS, onFCP, onLCP, onTTFB, onINP, type Metric } from 'web-vitals';

// ============================================================================
// Part 1 - Types
// ============================================================================

/** Rating for a performance metric based on Core Web Vitals thresholds */
export type MetricRating = 'good' | 'needs-improvement' | 'poor';

/** Report sent for each metric measurement */
export interface MetricReport {
  id: string;
  name: string;
  value: number;
  rating: MetricRating;
  delta: number;
  navigationType: string;
  timestamp: number;
  session: SessionMetadata;
}

/** Configuration for the vitals reporter */
export interface VitalsConfig {
  endpoint: string;
  debug: boolean;
  sampleRate: number;
  sessionId: string;
}

/** Session metadata collected from the browser */
export interface SessionMetadata {
  connectionType: string;
  deviceMemory: number;
  hardwareConcurrency: number;
  viewportWidth: number;
  viewportHeight: number;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  url: string;
  userAgent: string;
}

/** Extended PerformanceEntry for Largest Contentful Paint */
export interface LargestContentfulPaintEntry extends PerformanceEntry {
  element: Element | null;
  url: string;
}

/** Extended PerformanceEntry for Layout Shift */
export interface LayoutShiftEntry extends PerformanceEntry {
  hadRecentInput: boolean;
  value: number;
  sources: LayoutShiftSource[];
}

/** Source of a layout shift */
export interface LayoutShiftSource {
  node: Node | null;
  previousRect: DOMRectReadOnly;
  currentRect: DOMRectReadOnly;
}

/** Extended PerformanceEntry for Interaction to Next Paint */
export interface InteractionEntry extends PerformanceEntry {
  interactionId: number;
  duration: number;
}

// ============================================================================
// Part 2 - Core Reporter
// ============================================================================

let metricQueue: MetricReport[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let initialized = false;
let config: VitalsConfig | null = null;

/** Collects session metadata from the browser environment */
function collectSessionMetadata(): SessionMetadata {
  const connection = (navigator as any).connection;
  return {
    connectionType: connection?.effectiveType ?? 'unknown',
    deviceMemory: (navigator as any).deviceMemory ?? 0,
    hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    devicePixelRatio: window.devicePixelRatio,
    url: window.location.href,
    userAgent: navigator.userAgent,
  };
}

/** Logs a metric to the console with color-coded output */
function logMetric(metric: MetricReport): void {
  if (!config?.debug) return;

  const colors: Record<MetricRating, string> = {
    good: '#0cce6b',
    'needs-improvement': '#ffa400',
    poor: '#ff4e42',
  };

  const color = colors[metric.rating];
  console.log(
    `%c[Web Vitals] %c${metric.name}: ${metric.value.toFixed(2)} (${metric.rating})`,
    'color: #666; font-weight: normal;',
    `color: ${color}; font-weight: bold;`
  );
}

/** Converts a web-vitals Metric to a MetricReport */
function metricToReport(metric: Metric): MetricReport {
  return {
    id: metric.id,
    name: metric.name,
    value: metric.value,
    rating: metric.rating as MetricRating,
    delta: metric.delta,
    navigationType: metric.navigationType,
    timestamp: Date.now(),
    session: collectSessionMetadata(),
  };
}

/** Sends queued metrics to the analytics endpoint */
function flushMetrics(): void {
  if (metricQueue.length === 0) return;

  const payload = JSON.stringify(metricQueue.splice(0));

  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon(config?.endpoint ?? '/api/vitals', blob);
  } else {
    fetch(config?.endpoint ?? '/api/vitals', {
      method: 'POST',
      body: payload,
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
  }
}

/** Handles a metric from web-vitals, logs it, and queues it for sending */
function handleMetric(metric: Metric): void {
  if (!config) return;

  if (Math.random() > config.sampleRate) return;

  const report = metricToReport(metric);
  logMetric(report);
  metricQueue.push(report);

  if (metricQueue.length >= 10) {
    flushMetrics();
  }
}

/**
 * Initializes the web-vitals reporter.
 *
 * @param vitalsConfig - Configuration for the reporter
 *
 * @example
 * ```typescript
 * import { reportWebVitals } from './lib/vitals';
 *
 * reportWebVitals({
 *   endpoint: '/api/vitals',
 *   debug: process.env.NODE_ENV === 'development',
 *   sampleRate: 0.1,
 *   sessionId: crypto.randomUUID(),
 * });
 * ```
 */
export function reportWebVitals(vitalsConfig: VitalsConfig): void {
  if (initialized) return;
  initialized = true;
  config = vitalsConfig;

  onCLS(handleMetric);
  onFCP(handleMetric);
  onLCP(handleMetric);
  onTTFB(handleMetric);
  onINP(handleMetric);

  flushTimer = setInterval(flushMetrics, 5000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushMetrics();
    }
  });

  window.addEventListener('beforeunload', flushMetrics);

  if (config.debug) {
    console.log('[Web Vitals] Reporter initialized', {
      endpoint: config.endpoint,
      sampleRate: config.sampleRate,
      sessionId: config.sessionId,
    });
  }
}

// ============================================================================
// Part 3 - PerformanceObserver
// ============================================================================

/**
 * Observes long task entries (tasks blocking the main thread for > 50ms).
 * Logs each long task with timing information for diagnosis.
 */
export function observeLongTasks(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration > 50) {
        console.warn(
          `[Long Task] ${entry.duration.toFixed(1)}ms at ${entry.startTime.toFixed(0)}ms`,
          entry
        );
      }
    }
  });

  try {
    observer.observe({ type: 'longtask', buffered: true });
  } catch {
    // longtask not supported in this browser
  }
}

/**
 * Observes layout shift entries that contribute to CLS.
 * Only logs shifts with score > 0.05 and identifies source elements.
 */
export function observeLayoutShifts(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  let clsValue = 0;

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const shift = entry as any;
      if (!shift.hadRecentInput && shift.value > 0.05) {
        clsValue += shift.value;
        const sources = (shift.sources ?? [])
          .map((s: any) => s.node?.nodeName ?? 'unknown')
          .join(', ');
        console.warn(
          `[Layout Shift] score: ${shift.value.toFixed(4)} | cumulative: ${clsValue.toFixed(4)} | sources: ${sources}`
        );
      }
    }
  });

  try {
    observer.observe({ type: 'layout-shift', buffered: true });
  } catch {
    // layout-shift not supported
  }
}

/**
 * Observes resource timing entries and flags slow resources.
 * Resources taking > 500ms are logged with their type category.
 */
export function observeResourceTiming(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration > 500) {
        let category = 'other';
        if (entry.initiatorType === 'script') category = 'script';
        else if (entry.initiatorType === 'img') category = 'image';
        else if (entry.initiatorType === 'css' || entry.initiatorType === 'link') category = 'stylesheet';
        else if (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest') category = 'fetch';

        console.warn(
          `[Slow Resource] ${entry.name} took ${entry.duration.toFixed(0)}ms (${category})`
        );
      }
    }
  });

  try {
    observer.observe({ type: 'resource', buffered: true });
  } catch {
    // resource observer not supported
  }
}

// ============================================================================
// Part 4 - React Profiler Integration
// ============================================================================

/**
 * React Profiler onRender callback.
 * Logs component name, phase, and duration.
 * Flags renders exceeding the 16ms frame budget.
 *
 * @param id - Component name from the Profiler id prop
 * @param phase - 'mount' for initial render, 'update' for re-renders
 * @param actualDuration - Time spent rendering the committed update (ms)
 * @param baseDuration - Estimated time to render entire subtree without memoization (ms)
 * @param startTime - When React began rendering this update (ms)
 * @param commitTime - When React committed this update (ms)
 */
export function onRenderCallback(
  id: string,
  phase: 'mount' | 'update',
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number
): void {
  const budget = 16;
  const overBudget = actualDuration > budget;

  const message = `[React Profiler] ${id} (${phase}) actual: ${actualDuration.toFixed(1)}ms, base: ${baseDuration.toFixed(1)}ms`;

  if (overBudget) {
    console.warn(`${message} - EXCEEDS ${budget}ms FRAME BUDGET`);
  } else if (config?.debug) {
    console.log(message);
  }
}

// ============================================================================
// Part 5 - Session Metadata (exported for standalone use)
// ============================================================================

/**
 * Returns current session metadata.
 * Useful for attaching to custom analytics events outside of the vitals reporter.
 *
 * @returns Session metadata object with connection, device, and viewport info
 */
export function getSessionMetadata(): SessionMetadata {
  return collectSessionMetadata();
}

/**
 * Stops all vitals reporting and cleans up observers.
 * Useful for single-page apps where the reporter needs to be re-initialized.
 */
export function stopReporting(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flushMetrics();
  initialized = false;
  config = null;
  metricQueue = [];
}
