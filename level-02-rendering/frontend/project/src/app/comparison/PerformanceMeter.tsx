'use client';

import { useState, useEffect } from 'react';

interface PerformanceMetrics {
  ttfb: number;
  tti: number;
  tbt: number;
  fcp: number;
}

function MetricCard({ label, value, unit, description }: {
  label: string;
  value: number;
  unit: string;
  description: string;
}) {
  const color = value < 200 ? 'text-green-400' : value < 500 ? 'text-yellow-400' : 'text-red-400';
  return (
    <div className="bg-gray-800 rounded p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-mono font-bold ${color}`}>
        {value.toFixed(0)}<span className="text-sm text-gray-400">{unit}</span>
      </p>
      <p className="text-xs text-gray-500 mt-1">{description}</p>
    </div>
  );
}

/**
 * Client component that measures and displays page performance metrics
 * after the page has loaded.
 */
export function PerformanceMeter() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const paint = performance.getEntriesByType('paint');
      const fcp = paint.find((e) => e.name === 'first-contentful-paint');

      setMetrics({
        ttfb: nav ? nav.responseStart : 0,
        tti: nav ? nav.domInteractive : 0,
        tbt: 0,
        fcp: fcp ? fcp.startTime : 0,
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (!metrics) {
    return (
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <h2 className="text-lg font-bold text-white mb-4">Performance Metrics</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="bg-gray-800 rounded p-4 animate-pulse">
              <div className="h-3 bg-gray-700 rounded w-20 mb-2" />
              <div className="h-8 bg-gray-700 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <h2 className="text-lg font-bold text-white mb-4">Performance Metrics</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="TTFB"
          value={metrics.ttfb}
          unit="ms"
          description="Time to First Byte"
        />
        <MetricCard
          label="FCP"
          value={metrics.fcp}
          unit="ms"
          description="First Contentful Paint"
        />
        <MetricCard
          label="TTI"
          value={metrics.tti}
          unit="ms"
          description="Time to Interactive"
        />
        <MetricCard
          label="TBT"
          value={metrics.tbt}
          unit="ms"
          description="Total Blocking Time"
        />
      </div>
      <p className="text-xs text-gray-500 mt-4">
        Metrics measured using PerformanceNavigationTiming API. Refresh to see variation.
      </p>
    </div>
  );
}
