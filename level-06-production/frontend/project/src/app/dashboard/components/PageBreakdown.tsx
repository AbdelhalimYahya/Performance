/**
 * PAGE BREAKDOWN — Worst-Performing Pages Table
 *
 * Table showing top 10 worst-performing pages by LCP p75.
 * Columns: page URL, LCP p75, INP p75, CLS p75, session count, trend.
 * Sorted by LCP descending by default.
 */

'use client';

interface PageMetric {
  url: string;
  lcp: number;
  inp: number;
  cls: number;
  sessions: number;
  trend: number;
}

interface PageBreakdownProps {
  pages: PageMetric[];
}

// ─── Formatting Helpers ──────────────────────────────────────────────────

function formatLCP(ms: number): string {
  return ms >= 2500
    ? `${(ms / 1000).toFixed(2)}s`
    : `${ms.toFixed(0)}ms`;
}

function formatINP(ms: number): string {
  return `${ms.toFixed(0)}ms`;
}

function formatCLS(value: number): string {
  return value.toFixed(3);
}

function getCellColor(metric: string, value: number): string {
  switch (metric) {
    case 'lcp':
      if (value <= 2500) return 'text-green-400';
      if (value <= 4000) return 'text-yellow-400';
      return 'text-red-400';
    case 'inp':
      if (value <= 200) return 'text-green-400';
      if (value <= 500) return 'text-yellow-400';
      return 'text-red-400';
    case 'cls':
      if (value <= 0.1) return 'text-green-400';
      if (value <= 0.25) return 'text-yellow-400';
      return 'text-red-400';
    default:
      return 'text-gray-300';
  }
}

function TrendIndicator({ trend }: { trend: number }) {
  if (trend > 5) {
    return <span className="text-red-400 text-xs">↑ {trend.toFixed(1)}%</span>;
  }
  if (trend < -5) {
    return <span className="text-green-400 text-xs">↓ {Math.abs(trend).toFixed(1)}%</span>;
  }
  return <span className="text-gray-500 text-xs">→</span>;
}

// ─── Main Component ──────────────────────────────────────────────────────

export function PageBreakdown({ pages }: PageBreakdownProps) {
  // Sort by LCP descending (worst first)
  const sorted = [...pages].sort((a, b) => b.lcp - a.lcp).slice(0, 10);

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <h3 className="text-sm font-medium text-gray-400 mb-2">
        Top 10 Worst-Performing Pages
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Sorted by LCP p75 descending — pages that need the most attention.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Page URL</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">LCP p75</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">INP p75</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">CLS p75</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">Sessions</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">Trend</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((page, i) => (
              <tr
                key={page.url}
                className="border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors"
              >
                <td className="py-3 px-4 text-gray-300 max-w-[200px] truncate">
                  {page.url}
                </td>
                <td className={`py-3 px-4 text-right font-mono ${getCellColor('lcp', page.lcp)}`}>
                  {formatLCP(page.lcp)}
                </td>
                <td className={`py-3 px-4 text-right font-mono ${getCellColor('inp', page.inp)}`}>
                  {formatINP(page.inp)}
                </td>
                <td className={`py-3 px-4 text-right font-mono ${getCellColor('cls', page.cls)}`}>
                  {formatCLS(page.cls)}
                </td>
                <td className="py-3 px-4 text-right text-gray-400">
                  {page.sessions.toLocaleString()}
                </td>
                <td className="py-3 px-4 text-right">
                  <TrendIndicator trend={page.trend} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
