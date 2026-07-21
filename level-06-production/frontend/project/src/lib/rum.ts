/**
 * REAL USER MONITORING — Core Module
 *
 * Collects Core Web Vitals from real users using web-vitals library.
 * Batches metrics and sends via sendBeacon (non-blocking, survives page unload).
 *
 * Architecture:
 * 1. web-vitals fires callbacks for LCP, CLS, INP, FCP, TTFB
 * 2. Metrics are enriched with device/connection/session context
 * 3. Metrics are queued and flushed every 10s or on page hide
 * 4. sendBeacon sends batch to /api/rum endpoint
 */

import { onCLS, onFCP, onLCP, onTTFB, onINP, Metric } from 'web-vitals';

// ─── Configuration ───────────────────────────────────────────────────────

export interface RumConfig {
  endpoint: string;
  sampleRate: number;       // 0-1, percentage of sessions to report
  debug: boolean;
  appVersion: string;
  environment: string;      // 'production' | 'staging' | 'development'
}

const DEFAULT_CONFIG: RumConfig = {
  endpoint: '/api/rum',
  sampleRate: 0.1,
  debug: false,
  appVersion: 'unknown',
  environment: 'production',
};

// ─── Metric Interface ────────────────────────────────────────────────────

export interface RumMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
  navigationType: string;
  url: string;
  deviceMemory: number;
  hardwareConcurrency: number;
  connectionType: string;
  deviceClass: 'high' | 'mid' | 'low';
  sessionId: string;
  appVersion: string;
  environment: string;
  timestamp: number;
  attribution?: Record<string, unknown>;
}

// ─── Device Classification ──────────────────────────────────────────────

function getDeviceClass(): 'high' | 'mid' | 'low' {
  const memory = (navigator as any).deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const connection = (navigator as any).connection;
  const effectiveType = connection?.effectiveType || '4g';

  // High-end: plenty of memory and CPU
  if (memory >= 8 && cores >= 8) return 'high';

  // Low-end: limited resources or slow network
  if (memory <= 2 || effectiveType === '2g' || effectiveType === 'slow-2g') return 'low';

  // Mid-range: everything else
  return 'mid';
}

// ─── Session Management ──────────────────────────────────────────────────

function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  const stored = sessionStorage.getItem('rum-session-id');
  if (stored) return stored;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  sessionStorage.setItem('rum-session-id', id);
  return id;
}

// ─── Metric Enrichment ───────────────────────────────────────────────────

function enrichMetric(metric: Metric, config: RumConfig): RumMetric {
  const connection = (navigator as any).connection;
  const memory = (navigator as any).deviceMemory || 0;

  return {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
    url: location.href,
    deviceMemory: memory,
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    connectionType: connection?.effectiveType || 'unknown',
    deviceClass: getDeviceClass(),
    sessionId: getSessionId(),
    appVersion: config.appVersion,
    environment: config.environment,
    timestamp: Date.now(),
  };
}

function enrichWithAttribution(metric: Metric): Record<string, unknown> {
  const attr = (metric as any).attribution;
  if (!attr) return {};

  switch (metric.name) {
    case 'LCP':
      return {
        element: attr.element?.tagName || 'unknown',
        url: attr.url || '',
        loadTime: attr.loadTime || 0,
        ttfb: attr.ttfb || 0,
        renderDelay: attr.renderDelay || 0,
      };
    case 'CLS':
      return {
        largestShift: attr.largestShift || 0,
        largestShiftSource: attr.largestShiftSource || [],
        largestShiftTarget: attr.largestShiftTarget?.tagName || 'unknown',
      };
    case 'INP':
      return {
        eventType: attr.eventType || 'unknown',
        eventTarget: attr.eventTarget?.tagName || 'unknown',
        loadState: attr.loadState || 'unknown',
        inputDelay: attr.inputDelay || 0,
        processingTime: attr.processingTime || 0,
        presentationDelay: attr.presentationDelay || 0,
      };
    default:
      return {};
  }
}

// ─── Metric Queue & Batch Sending ────────────────────────────────────────

let metricQueue: RumMetric[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let config: RumConfig = DEFAULT_CONFIG;

function flush() {
  if (metricQueue.length === 0) return;

  const batch = [...metricQueue];
  metricQueue = [];

  const payload = JSON.stringify(batch);

  if (config.debug) {
    console.log('[RUM] Flushing batch:', batch);
  }

  // sendBeacon survives page unload (unlike fetch)
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon(config.endpoint, payload);
  } else {
    // Fallback for environments without sendBeacon
    fetch(config.endpoint, {
      method: 'POST',
      body: payload,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => {});
  }
}

function queueMetric(metric: RumMetric) {
  metricQueue.push(metric);

  // Flush immediately if queue is large
  if (metricQueue.length >= 20) {
    flush();
  }
}

// ─── Initialization ──────────────────────────────────────────────────────

export function initRUM(userConfig: Partial<RumConfig> = {}) {
  if (typeof window === 'undefined') return;

  config = { ...DEFAULT_CONFIG, ...userConfig };

  // Sampling: skip reporting for unsampled sessions
  if (Math.random() >= config.sampleRate) {
    if (config.debug) console.log('[RUM] Session not sampled, skipping');
    return;
  }

  if (config.debug) console.log('[RUM] Initializing with config:', config);

  // Register web-vitals callbacks
  onCLS((metric) => {
    const enriched = enrichMetric(metric, config);
    enriched.attribution = enrichWithAttribution(metric);
    queueMetric(enriched);
  }, { reportAllChanges: false });

  onFCP((metric) => {
    queueMetric(enrichMetric(metric, config));
  });

  onLCP((metric) => {
    const enriched = enrichMetric(metric, config);
    enriched.attribution = enrichWithAttribution(metric);
    queueMetric(enriched);
  }, { reportAllChanges: false });

  onTTFB((metric) => {
    queueMetric(enrichMetric(metric, config));
  });

  onINP((metric) => {
    const enriched = enrichMetric(metric, config);
    enriched.attribution = enrichWithAttribution(metric);
    queueMetric(enriched);
  }, { reportAllChanges: false });

  // Flush every 10 seconds
  flushTimer = setInterval(flush, 10_000);

  // Flush on page hide (user navigating away)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flush();
    }
  });

  // Flush before page unload
  window.addEventListener('beforeunload', flush);

  if (config.debug) console.log('[RUM] Initialized successfully');
}

export function stopRUM() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flush(); // Final flush
}
