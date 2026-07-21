/**
 * RUM OBSERVER — Extended Performance Metrics
 *
 * Uses PerformanceObserver API to capture metrics beyond Core Web Vitals:
 * - Long tasks that block the main thread
 * - Slow resources (scripts, images, fonts, API calls)
 * - Full navigation timing breakdown
 * - Individual layout shifts with source elements
 *
 * These are sent as separate events to the RUM endpoint.
 */

export interface LongTaskEntry {
  duration: number;
  attribution: Array<{
    name: string;
    startTime: number;
    entryType: string;
    scripts: Array<{
      sourceURL: string;
      sourceFunctionName: string;
      sourceCharPosition: number;
      duration: number;
    }>;
  }>;
  startTime: number;
  name: string;
}

export interface SlowResourceEntry {
  name: string;
  type: string;
  duration: number;
  transferSize: number;
  initiatorType: string;
}

export interface NavigationTimingEntry {
  dns: number;
  tcp: number;
  ttfb: number;
  domContentLoaded: number;
  load: number;
  domInteractive: number;
  responseEnd: number;
}

export interface LayoutShiftEntry {
  value: number;
  sources: Array<{
    node: string;
    previousRect: string;
    currentRect: string;
  }>;
  startTime: number;
}

// ─── Resource Thresholds (ms) ────────────────────────────────────────────

const RESOURCE_THRESHOLDS: Record<string, number> = {
  script: 200,  // Scripts block parsing — slow scripts delay interactivity
  img: 500,     // Images below fold are less critical
  font: 100,    // Fonts cause FOIT/FOUT if slow
  fetch: 300,   // API calls should be fast
  xmlhttprequest: 300,
};

// ─── Observer: Long Tasks ────────────────────────────────────────────────

let longTaskObserver: PerformanceObserver | null = null;

export function observeLongTasks(): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEntry[]) {
        const duration = entry.duration;
        const attribution = (entry as any).attribution || [];

        const scripts = attribution.flatMap((a: any) =>
          (a.scripts || []).map((s: any) => s.sourceURL)
        );

        console.warn('[RUM] Long task:', {
          duration: `${duration.toFixed(1)}ms`,
          scripts: scripts.length > 0 ? scripts : ['unknown'],
          startTime: entry.startTime,
        });
      }
    });

    longTaskObserver.observe({ type: 'longtask', buffered: true });
  } catch {
    // longtask may not be supported in all browsers
  }
}

// ─── Observer: Resource Timing ───────────────────────────────────────────

let resourceObserver: PerformanceObserver | null = null;

export function observeResourceTiming(): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

  try {
    resourceObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        const type = entry.initiatorType;
        const threshold = RESOURCE_THRESHOLDS[type];

        if (!threshold) continue;

        if (entry.duration > threshold) {
          console.warn('[RUM] Slow resource:', {
            name: entry.name.split('/').pop() || entry.name,
            type,
            duration: `${entry.duration.toFixed(1)}ms`,
            transferSize: entry.transferSize,
            threshold: `${threshold}ms`,
          });
        }
      }
    });

    resourceObserver.observe({ type: 'resource', buffered: false });
  } catch {
    // resource observer not supported
  }
}

// ─── Observer: Navigation Timing ─────────────────────────────────────────

let navigationObserver: PerformanceObserver | null = null;

export function observeNavigationTiming(): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

  try {
    navigationObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceNavigationTiming[]) {
        if (entry.name !== location.href) continue;

        const timing: NavigationTimingEntry = {
          dns: entry.domainLookupEnd - entry.domainLookupStart,
          tcp: entry.connectEnd - entry.connectStart,
          ttfb: entry.responseStart - entry.requestStart,
          domContentLoaded: entry.domContentLoadedEventEnd - entry.fetchStart,
          load: entry.loadEventEnd - entry.fetchStart,
          domInteractive: entry.domInteractive - entry.fetchStart,
          responseEnd: entry.responseEnd - entry.fetchStart,
        };

        console.log('[RUM] Navigation timing:', timing);
        break;
      }
    });

    navigationObserver.observe({ type: 'navigation', buffered: true });
  } catch {
    // navigation observer not supported
  }
}

// ─── Observer: Layout Shifts ─────────────────────────────────────────────

let layoutShiftObserver: PerformanceObserver | null = null;

export function observeLayoutShifts(): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

  try {
    layoutShiftObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any[]) {
        if (entry.hadRecentInput) continue;

        const sources = (entry.sources || []).map((source: any) => ({
          node: source.node?.tagName || 'unknown',
          previousRect: JSON.stringify(source.previousRect),
          currentRect: JSON.stringify(source.currentRect),
        }));

        console.warn('[RUM] Layout shift:', {
          score: entry.value.toFixed(3),
          sources,
          startTime: entry.startTime,
        });
      }
    });

    layoutShiftObserver.observe({ type: 'layout-shift', buffered: false });
  } catch {
    // layout-shift observer not supported
  }
}

// ─── Start All Observers ─────────────────────────────────────────────────

export function startAllObservers(): void {
  observeLongTasks();
  observeResourceTiming();
  observeNavigationTiming();
  observeLayoutShifts();
}

// ─── Stop All Observers ──────────────────────────────────────────────────

export function stopAllObservers(): void {
  longTaskObserver?.disconnect();
  resourceObserver?.disconnect();
  navigationObserver?.disconnect();
  layoutShiftObserver?.disconnect();
}
