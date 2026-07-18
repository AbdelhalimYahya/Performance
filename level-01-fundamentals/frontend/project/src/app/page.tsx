'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo, Profiler, ProfilerOnRenderCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

interface MetricState {
  value: string;
  rating: 'good' | 'needs-improvement' | 'poor' | 'uninitialized';
}

interface MemoryInfo {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
}

interface TimingBreakdown {
  dns: number;
  tcp: number;
  request: number;
  response: number;
}

interface RenderTestResult {
  totalTime: number;
  reRenders: number;
}

// ============================================================================
// Sticky Header
// ============================================================================

function Header({ score }: { score: string }) {
  return (
    <header className="sticky top-0 z-50 bg-gray-900 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
      <h1 className="text-xl font-bold text-white">⚡ Perf Dashboard</h1>
      <div className="flex items-center gap-3">
        <span className="text-gray-400 text-sm">Page Score</span>
        <span className="text-lg font-mono font-bold text-yellow-400">{score}</span>
      </div>
    </header>
  );
}

// ============================================================================
// Section 1 - Live Metrics Panel
// ============================================================================

function MetricCard({ name, value, rating, description }: {
  name: string;
  value: string;
  rating: MetricState['rating'];
  description: string;
}) {
  const badgeColors: Record<string, string> = {
    good: 'bg-green-900 text-green-300',
    'needs-improvement': 'bg-yellow-900 text-yellow-300',
    poor: 'bg-red-900 text-red-300',
    uninitialized: 'bg-gray-800 text-gray-400',
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-sm font-medium">{name}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColors[rating]}`}>
          {rating === 'uninitialized' ? '...' : rating}
        </span>
      </div>
      <div className="text-2xl font-mono font-bold text-white mb-2">{value}</div>
      <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}

function LiveMetricsPanel() {
  const [metrics, setMetrics] = useState<Record<string, MetricState>>({
    LCP: { value: '--', rating: 'uninitialized' },
    CLS: { value: '--', rating: 'uninitialized' },
    INP: { value: '--', rating: 'uninitialized' },
    FCP: { value: '--', rating: 'uninitialized' },
    TTFB: { value: '--', rating: 'uninitialized' },
  });

  useEffect(() => {
    let observer: PerformanceObserver | null = null;

    const updateMetrics = () => {
      if (typeof window === 'undefined') return;

      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (nav) {
        setMetrics((prev) => ({
          ...prev,
          TTFB: {
            value: `${Math.round(nav.responseStart)}ms`,
            rating: nav.responseStart < 800 ? 'good' : nav.responseStart < 1800 ? 'needs-improvement' : 'poor',
          },
          FCP: {
            value: `${Math.round(nav.domContentLoadedEventEnd)}ms`,
            rating: nav.domContentLoadedEventEnd < 1800 ? 'good' : nav.domContentLoadedEventEnd < 3000 ? 'needs-improvement' : 'poor',
          },
        }));
      }

      try {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'largest-contentful-paint') {
              setMetrics((prev) => ({
                ...prev,
                LCP: {
                  value: `${Math.round(entry.startTime)}ms`,
                  rating: entry.startTime < 2500 ? 'good' : entry.startTime < 4000 ? 'needs-improvement' : 'poor',
                },
              }));
            }
            if (entry.entryType === 'layout-shift' && !(entry as any).hadRecentInput) {
              setMetrics((prev) => {
                const current = prev.CLS.rating === 'uninitialized' ? 0 : parseFloat(prev.CLS.value);
                const newValue = current + (entry as any).value;
                return {
                  ...prev,
                  CLS: {
                    value: newValue.toFixed(3),
                    rating: newValue < 0.1 ? 'good' : newValue < 0.25 ? 'needs-improvement' : 'poor',
                  },
                };
              });
            }
          }
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
        observer.observe({ type: 'layout-shift', buffered: true });
      } catch {
        // Observer not supported
      }
    };

    updateMetrics();
    const interval = setInterval(updateMetrics, 2000);

    return () => {
      clearInterval(interval);
      observer?.disconnect();
    };
  }, []);

  const descriptions: Record<string, string> = {
    LCP: 'Time until the largest visible element (hero image or heading) finishes painting. Affects initial load perception.',
    CLS: 'Cumulative score of unexpected layout shifts. Lower is better. Caused by images without dimensions or dynamic content injection.',
    INP: 'Latency of the slowest user interaction (click/tap). Measures responsiveness across the entire page session.',
    FCP: 'Time until the first pixel of content is painted. Shows whether the server is returning HTML quickly.',
    TTFB: 'Time from navigation start to first byte received. Reflects server processing and network latency.',
  };

  return (
    <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <h2 className="text-lg font-semibold text-white mb-4">Live Metrics Panel</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(metrics).map(([name, state]) => (
          <MetricCard
            key={name}
            name={name}
            value={state.value}
            rating={state.rating}
            description={descriptions[name]}
          />
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// Section 2 - Render Stress Test
// ============================================================================

function RenderCounter({ id, phase, actualDuration, baseDuration }: {
  id: string;
  phase: 'mount' | 'update';
  actualDuration: number;
  baseDuration: number;
}) {
  return null;
}

function StressListItem({ index }: { index: number }) {
  return (
    <div className="flex items-center gap-2 py-1 px-2 text-sm text-gray-300 border-b border-gray-800">
      <span className="w-8 text-gray-500">{index}</span>
      <span>Item {index} - Lorem ipsum dolor sit amet</span>
    </div>
  );
}

function VirtualizedList({ count, itemHeight, containerHeight }: {
  count: number;
  itemHeight: number;
  containerHeight: number;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 3);
  const endIndex = Math.min(count - 1, Math.ceil((scrollTop + containerHeight) / itemHeight) + 3);
  const visibleItems = [];

  for (let i = startIndex; i <= endIndex; i++) {
    visibleItems.push(
      <div key={i} style={{ height: itemHeight }} className="flex items-center px-2 text-sm text-gray-300 border-b border-gray-800">
        <span className="w-8 text-gray-500">{i}</span>
        <span>Item {i} - Lorem ipsum dolor sit amet</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-auto border border-gray-700 rounded bg-gray-950"
      style={{ height: containerHeight }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: startIndex * itemHeight }} />
      {visibleItems}
      <div style={{ height: (count - endIndex - 1) * itemHeight }} />
    </div>
  );
}

function RenderStressTest() {
  const [testRunning, setTestRunning] = useState(false);
  const [result, setResult] = useState<RenderTestResult | null>(null);
  const [useVirtualization, setUseVirtualization] = useState(false);
  const [renderCount, setRenderCount] = useState(500);
  const renderTimesRef = useRef<number[]>([]);

  const onRender: ProfilerOnRenderCallback = useCallback((_id, _phase, actualDuration) => {
    renderTimesRef.current.push(actualDuration);
  }, []);

  const runTest = useCallback(() => {
    setTestRunning(true);
    setResult(null);
    renderTimesRef.current = [];

    const start = performance.now();
    setRenderCount(0);

    setTimeout(() => {
      setRenderCount(500);
      setTimeout(() => {
        const totalTime = performance.now() - start;
        const reRenders = renderTimesRef.current.length;
        setResult({ totalTime, reRenders });
        setTestRunning(false);
        renderTimesRef.current = [];
      }, 100);
    }, 50);
  }, []);

  return (
    <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <h2 className="text-lg font-semibold text-white mb-4">Render Stress Test</h2>
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <button
          onClick={runTest}
          disabled={testRunning}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded text-sm font-medium transition-colors"
        >
          {testRunning ? 'Running...' : 'Run Render Test'}
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={useVirtualization}
            onChange={(e) => setUseVirtualization(e.target.checked)}
            className="rounded bg-gray-700 border-gray-600"
          />
          With Optimization (Virtualized)
        </label>
      </div>
      {result && (
        <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
          <div className="bg-gray-800 p-3 rounded">
            <div className="text-gray-400">Total Render Time</div>
            <div className="text-xl font-mono font-bold text-white">{result.totalTime.toFixed(1)}ms</div>
          </div>
          <div className="bg-gray-800 p-3 rounded">
            <div className="text-gray-400">Re-renders</div>
            <div className="text-xl font-mono font-bold text-white">{result.reRenders}</div>
          </div>
          <div className="bg-gray-800 p-3 rounded">
            <div className="text-gray-400">Mode</div>
            <div className="text-xl font-mono font-bold text-white">{useVirtualization ? 'Virtualized' : 'Naive'}</div>
          </div>
        </div>
      )}
      <Profiler id="StressTest" onRender={onRender}>
        {useVirtualization ? (
          <VirtualizedList count={renderCount} itemHeight={36} containerHeight={300} />
        ) : (
          <div className="overflow-auto border border-gray-700 rounded bg-gray-950" style={{ height: 300 }}>
            {Array.from({ length: renderCount }, (_, i) => (
              <StressListItem key={i} index={i} />
            ))}
          </div>
        )}
      </Profiler>
    </section>
  );
}

// ============================================================================
// Section 3 - Long Task Detector
// ============================================================================

function LongTaskDetector() {
  const [taskDuration, setTaskDuration] = useState<string>('--');
  const [longTaskCount, setLongTaskCount] = useState(0);
  const [uiBlocked, setUiBlocked] = useState<string>('--');
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) {
          setLongTaskCount((c) => c + 1);
        }
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
    return () => observer.disconnect();
  }, []);

  const triggerLongTask = useCallback(() => {
    setIsRunning(true);
    const start = performance.now();

    const items = Array.from({ length: 1_000_000 }, () => Math.random());
    items.sort((a, b) => a - b);

    const duration = performance.now() - start;
    setTaskDuration(`${duration.toFixed(1)}ms`);
    setUiBlocked(`${duration.toFixed(1)}ms`);
    setIsRunning(false);
  }, []);

  const triggerChunkedTask = useCallback(() => {
    setIsRunning(true);
    const start = performance.now();
    const items = Array.from({ length: 1_000_000 }, () => Math.random());
    const CHUNK = 50_000;
    let index = 0;

    function processChunk() {
      const chunkEnd = Math.min(index + CHUNK, items.length);
      items.slice(index, chunkEnd).sort((a, b) => a - b);
      index = chunkEnd;

      if (index < items.length) {
        setTimeout(processChunk, 0);
      } else {
        const duration = performance.now() - start;
        setTaskDuration(`${duration.toFixed(1)}ms`);
        setUiBlocked('0ms (chunked)');
        setIsRunning(false);
      }
    }

    processChunk();
  }, []);

  return (
    <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <h2 className="text-lg font-semibold text-white mb-4">Long Task Detector</h2>
      <div className="flex flex-wrap gap-3 mb-4">
        <button
          onClick={triggerLongTask}
          disabled={isRunning}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white rounded text-sm font-medium transition-colors"
        >
          Trigger Long Task
        </button>
        <button
          onClick={triggerChunkedTask}
          disabled={isRunning}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white rounded text-sm font-medium transition-colors"
        >
          Trigger Chunked Task
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="bg-gray-800 p-3 rounded">
          <div className="text-gray-400">Task Duration</div>
          <div className="text-xl font-mono font-bold text-white">{taskDuration}</div>
        </div>
        <div className="bg-gray-800 p-3 rounded">
          <div className="text-gray-400">Long Tasks Detected</div>
          <div className="text-xl font-mono font-bold text-white">{longTaskCount}</div>
        </div>
        <div className="bg-gray-800 p-3 rounded">
          <div className="text-gray-400">UI Blocked</div>
          <div className="text-xl font-mono font-bold text-white">{uiBlocked}</div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Section 4 - Network Timing
// ============================================================================

function TimingBar({ label, value, max, color }: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 text-gray-400 text-right">{label}</span>
      <div className="flex-1 bg-gray-800 rounded h-5 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-white font-mono">{value.toFixed(1)}ms</span>
    </div>
  );
}

function NetworkTiming() {
  const [timing, setTiming] = useState<TimingBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchTiming = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/data');
      const serverTiming = res.headers.get('Server-Timing');
      await res.json();

      const entry = performance.getEntriesByName('/api/data')[0] as PerformanceResourceTiming | undefined;

      if (entry) {
        setTiming({
          dns: entry.domainLookupEnd - entry.domainLookupStart,
          tcp: entry.connectEnd - entry.connectStart,
          request: entry.responseStart - entry.requestStart,
          response: entry.responseEnd - entry.responseStart,
        });
      } else if (serverTiming) {
        const parse = (s: string) => {
          const match = s.match(/dur=([0-9.]+)/);
          return match ? parseFloat(match[1]) : 0;
        };
        const parts = serverTiming.split(',');
        setTiming({
          dns: 0,
          tcp: 0,
          request: parse(parts[0] ?? ''),
          response: parse(parts[1] ?? ''),
        });
      }
    } catch {
      setError('Failed to fetch timing data');
    } finally {
      setLoading(false);
    }
  }, []);

  const maxVal = timing ? Math.max(timing.dns, timing.tcp, timing.request, timing.response, 1) : 1;

  return (
    <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <h2 className="text-lg font-semibold text-white mb-4">Network Timing</h2>
      <button
        onClick={fetchTiming}
        disabled={loading}
        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white rounded text-sm font-medium transition-colors mb-4"
      >
        {loading ? 'Fetching...' : 'Fetch /api/data'}
      </button>
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      {timing && (
        <div className="space-y-2">
          <TimingBar label="DNS" value={timing.dns} max={maxVal} color="bg-blue-500" />
          <TimingBar label="TCP" value={timing.tcp} max={maxVal} color="bg-green-500" />
          <TimingBar label="Request" value={timing.request} max={maxVal} color="bg-yellow-500" />
          <TimingBar label="Response" value={timing.response} max={maxVal} color="bg-red-500" />
        </div>
      )}
    </section>
  );
}

// ============================================================================
// Section 5 - Memory Monitor
// ============================================================================

function MemoryGauge({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  const color = pct < 50 ? 'bg-green-500' : pct < 80 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span>
        <span>{used.toFixed(1)} MB</span>
      </div>
      <div className="bg-gray-800 rounded h-3 overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MemoryMonitor() {
  const [memory, setMemory] = useState<MemoryInfo | null>(null);

  useEffect(() => {
    const perf = performance as any;
    if (!perf.memory) return;

    const update = () => {
      setMemory({
        jsHeapSizeLimit: perf.memory.jsHeapSizeLimit / 1048576,
        totalJSHeapSize: perf.memory.totalJSHeapSize / 1048576,
        usedJSHeapSize: perf.memory.usedJSHeapSize / 1048576,
      });
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!memory) {
    return (
      <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <h2 className="text-lg font-semibold text-white mb-4">Memory Monitor</h2>
        <p className="text-gray-500 text-sm">performance.memory not available (Chrome/Edge required)</p>
      </section>
    );
  }

  return (
    <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <h2 className="text-lg font-semibold text-white mb-4">Memory Monitor</h2>
      <div className="space-y-4">
        <MemoryGauge used={memory.usedJSHeapSize} limit={memory.jsHeapSizeLimit} label="Used Heap" />
        <MemoryGauge used={memory.totalJSHeapSize} limit={memory.jsHeapSizeLimit} label="Total Heap" />
        <div className="grid grid-cols-3 gap-3 text-sm mt-4">
          <div className="bg-gray-800 p-2 rounded text-center">
            <div className="text-gray-400 text-xs">Heap Limit</div>
            <div className="text-white font-mono">{memory.jsHeapSizeLimit.toFixed(0)} MB</div>
          </div>
          <div className="bg-gray-800 p-2 rounded text-center">
            <div className="text-gray-400 text-xs">Total</div>
            <div className="text-white font-mono">{memory.totalJSHeapSize.toFixed(1)} MB</div>
          </div>
          <div className="bg-gray-800 p-2 rounded text-center">
            <div className="text-gray-400 text-xs">Used</div>
            <div className="text-white font-mono">{memory.usedJSHeapSize.toFixed(1)} MB</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function DashboardPage() {
  const [score] = useState('--');

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header score={score} />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <LiveMetricsPanel />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RenderStressTest />
          <LongTaskDetector />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <NetworkTiming />
          <MemoryMonitor />
        </div>
      </main>
    </div>
  );
}
