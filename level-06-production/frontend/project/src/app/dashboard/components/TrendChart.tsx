/**
 * TREND CHART — Pure CSS/SVG Line Chart
 *
 * Shows 30-day p75 trend for a single metric.
 * No charting library — pure CSS + inline SVG.
 * Threshold lines drawn as dashed horizontal lines.
 * Hover tooltip shows exact date and value.
 */

'use client';

interface DailyMetric {
  date: string;
  lcp: number;
  inp: number;
  cls: number;
  fcp: number;
  ttfb: number;
  tbt: number;
}

interface TrendChartProps {
  daily: DailyMetric[];
  metric: keyof Omit<DailyMetric, 'date'>;
  label: string;
  color: string;
}

// ─── Thresholds for dashed reference lines ────────────────────────────────

const THRESHOLD_LINES: Record<string, number[]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
  TBT: [200, 600],
};

export function TrendChart({ daily, metric, label, color }: TrendChartProps) {
  if (!daily || daily.length === 0) return null;

  const values = daily.map((d) => d[metric] as number);
  const maxVal = Math.max(...values) * 1.15;
  const minVal = 0;

  const chartW = 600;
  const chartH = 200;
  const padX = 50;
  const padY = 20;
  const plotW = chartW - padX * 2;
  const plotH = chartH - padY * 2;

  // Build polyline points
  const points = values.map((v, i) => {
    const x = padX + (i / (values.length - 1)) * plotW;
    const y = padY + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;
    return `${x},${y}`;
  });

  // Threshold lines
  const thresholds = THRESHOLD_LINES[label] || [];

  // X-axis labels (show every 5th date)
  const xLabels = daily
    .filter((_, i) => i % 5 === 0 || i === daily.length - 1)
    .map((d) => {
      const idx = daily.indexOf(d);
      const x = padX + (idx / (daily.length - 1)) * plotW;
      const dateStr = new Date(d.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      return { x, label: dateStr };
    });

  // Y-axis ticks
  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = minVal + (i / yTicks) * (maxVal - minVal);
    const y = padY + plotH - (i / yTicks) * plotH;
    return { y, value: val };
  });

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <h3 className="text-sm font-medium text-gray-400 mb-4">
        {label} — 30-Day p75 Trend
      </h3>
      <div className="relative">
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto">
          {/* Y-axis gridlines and labels */}
          {yTickValues.map((t, i) => (
            <g key={i}>
              <line
                x1={padX} y1={t.y} x2={padX + plotW} y2={t.y}
                stroke="#374151" strokeWidth="0.5"
              />
              <text x={padX - 5} y={t.y + 4} textAnchor="end"
                fill="#6b7280" fontSize="8">
                {label === 'CLS'
                  ? t.value.toFixed(2)
                  : `${(t.value / 1000).toFixed(1)}s`}
              </text>
            </g>
          ))}

          {/* Threshold dashed lines */}
          {thresholds.map((thresh, i) => {
            const y = padY + plotH - ((thresh - minVal) / (maxVal - minVal)) * plotH;
            return (
              <g key={i}>
                <line
                  x1={padX} y1={y} x2={padX + plotW} y2={y}
                  stroke="#ef4444" strokeWidth="1" strokeDasharray="4,4" opacity="0.5"
                />
                <text x={padX + plotW + 2} y={y + 3}
                  fill="#ef4444" fontSize="7">
                  {label === 'CLS' ? thresh : `${(thresh / 1000).toFixed(1)}s`}
                </text>
              </g>
            );
          })}

          {/* Data line */}
          <polyline
            points={points.join(' ')}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* X-axis labels */}
          {xLabels.map((xl, i) => (
            <text key={i} x={xl.x} y={chartH - 2} textAnchor="middle"
              fill="#6b7280" fontSize="7">
              {xl.label}
            </text>
          ))}
        </svg>

        {/* Hover tooltips — positioned absolutely over each data point */}
        {daily.map((d, i) => {
          const x = padX + (i / (daily.length - 1)) * plotW;
          const y = padY + plotH - ((values[i] - minVal) / (maxVal - minVal)) * plotH;
          const pctX = (x / chartW) * 100;
          const pctY = (y / chartH) * 100;
          const dateStr = new Date(d.date).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          });
          const formatted = label === 'CLS'
            ? values[i].toFixed(3)
            : `${(values[i] / 1000).toFixed(2)}s`;
          return (
            <div
              key={i}
              className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full opacity-0 hover:opacity-100 hover:bg-white/20 transition-opacity cursor-pointer z-10"
              style={{ left: `${pctX}%`, top: `${pctY}%` }}
            >
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap
                opacity-0 group-hover:opacity-100 pointer-events-none shadow-lg">
                {dateStr}: {formatted}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
