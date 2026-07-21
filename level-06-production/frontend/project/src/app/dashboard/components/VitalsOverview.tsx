/**
 * VITALS OVERVIEW — Metric Cards
 *
 * Displays six Core Web Vitals metric cards with p75 values,
 * rating badges, 7-day trend arrows, and threshold references.
 *
 * Good/Needs Improvement/Poor thresholds follow the CWV spec:
 * - LCP: 2500ms / 4000ms
 * - INP: 200ms / 500ms
 * - CLS: 0.1 / 0.25
 * - FCP: 1800ms / 3000ms
 * - TTFB: 800ms / 1800ms
 * - TBT: 200ms / 600ms
 */

'use client';

interface MetricSummary {
  p75: number;
  rating: string;
  trend: number;
}

interface VitalsOverviewProps {
  summary: {
    lcp: MetricSummary;
    inp: MetricSummary;
    cls: MetricSummary;
    fcp: MetricSummary;
    ttfb: MetricSummary;
    tbt: MetricSummary;
  };
}

// ─── Thresholds & Formatting ─────────────────────────────────────────────

interface Thresholds {
  good: number;
  poor: number;
  unit: string;
  format: (v: number) => string;
}

const THRESHOLDS: Record<string, Thresholds> = {
  LCP: {
    good: 2500, poor: 4000, unit: 'ms',
    format: (v) => `${(v / 1000).toFixed(2)}s`,
  },
  INP: {
    good: 200, poor: 500, unit: 'ms',
    format: (v) => `${v.toFixed(0)}ms`,
  },
  CLS: {
    good: 0.1, poor: 0.25, unit: '',
    format: (v) => v.toFixed(3),
  },
  FCP: {
    good: 1800, poor: 3000, unit: 'ms',
    format: (v) => `${(v / 1000).toFixed(2)}s`,
  },
  TTFB: {
    good: 800, poor: 1800, unit: 'ms',
    format: (v) => `${v.toFixed(0)}ms`,
  },
  TBT: {
    good: 200, poor: 600, unit: 'ms',
    format: (v) => `${v.toFixed(0)}ms`,
  },
};

function getRatingColor(rating: string): string {
  switch (rating) {
    case 'good': return 'bg-green-900 text-green-300';
    case 'needs-improvement': return 'bg-yellow-900 text-yellow-300';
    case 'poor': return 'bg-red-900 text-red-300';
    default: return 'bg-gray-800 text-gray-400';
  }
}

function getRatingLabel(rating: string): string {
  switch (rating) {
    case 'good': return 'Good';
    case 'needs-improvement': return 'Needs Improvement';
    case 'poor': return 'Poor';
    default: return 'Unknown';
  }
}

function TrendArrow({ trend }: { trend: number }) {
  if (trend > 2) {
    return <span className="text-red-400">↑ {(trend).toFixed(1)}%</span>;
  }
  if (trend < -2) {
    return <span className="text-green-400">↓ {(Math.abs(trend)).toFixed(1)}%</span>;
  }
  return <span className="text-gray-500">→</span>;
}

// ─── Single Metric Card ──────────────────────────────────────────────────

function MetricCard({ label, data }: { label: string; data: MetricSummary }) {
  const t = THRESHOLDS[label];

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-400">{label}</h3>
        <span className={`text-xs px-2 py-1 rounded ${getRatingColor(data.rating)}`}>
          {getRatingLabel(data.rating)}
        </span>
      </div>
      <div className="flex items-end gap-3">
        <span className="text-3xl font-bold">{t.format(data.p75)}</span>
        <TrendArrow trend={data.trend} />
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Good: &lt;{t.format(t.good)} | Poor: &gt;{t.format(t.poor)}
      </p>
    </div>
  );
}

// ─── Overview Component ──────────────────────────────────────────────────

export function VitalsOverview({ summary }: VitalsOverviewProps) {
  const metrics: [string, MetricSummary][] = [
    ['LCP', summary.lcp],
    ['INP', summary.inp],
    ['CLS', summary.cls],
    ['FCP', summary.fcp],
    ['TTFB', summary.ttfb],
    ['TBT', summary.tbt],
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {metrics.map(([label, data]) => (
        <MetricCard key={label} label={label} data={data} />
      ))}
    </div>
  );
}
