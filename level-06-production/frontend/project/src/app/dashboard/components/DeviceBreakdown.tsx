/**
 * DEVICE BREAKDOWN — Stacked Bar Chart
 *
 * Pure CSS stacked bar chart showing metric distribution by device class.
 * The key insight: mid and low-end devices have much worse metrics than
 * high-end — this is what drives real-world user experience.
 */

'use client';

interface DeviceMetric {
  deviceClass: 'high' | 'mid' | 'low';
  lcp: number;
  inp: number;
  cls: number;
  fcp: number;
  ttfb: number;
  sessions: number;
}

interface DeviceBreakdownProps {
  devices: DeviceMetric[];
}

// ─── Device Class Config ─────────────────────────────────────────────────

const DEVICE_CONFIG: Record<string, { color: string; label: string }> = {
  high: { color: 'bg-green-500', label: 'High-End' },
  mid: { color: 'bg-yellow-500', label: 'Mid-Range' },
  low: { color: 'bg-red-500', label: 'Low-End' },
};

const METRICS: Array<{ key: string; label: string; unit: string }> = [
  { key: 'lcp', label: 'LCP', unit: 'ms' },
  { key: 'inp', label: 'INP', unit: 'ms' },
  { key: 'cls', label: 'CLS', unit: '' },
];

// ─── Single Bar ──────────────────────────────────────────────────────────

function MetricBar({
  metric,
  devices,
}: {
  metric: typeof METRICS[number];
  devices: DeviceMetric[];
}) {
  // Calculate max value across all device classes for this metric
  const values = devices.map((d) => d[metric.key as keyof DeviceMetric] as number);
  const maxVal = Math.max(...values) * 1.2;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-300">{metric.label}</span>
        <span className="text-xs text-gray-500">
          {metric.unit === 'ms' ? `Threshold: 2500ms` : 'Threshold: 0.1'}
        </span>
      </div>
      <div className="space-y-2">
        {devices.map((device) => {
          const value = device[metric.key as keyof DeviceMetric] as number;
          const pct = maxVal > 0 ? (value / maxVal) * 100 : 0;
          const config = DEVICE_CONFIG[device.deviceClass];
          const formatted = metric.unit === 'ms'
            ? `${(value / 1000).toFixed(2)}s`
            : value.toFixed(3);

          return (
            <div key={device.deviceClass} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-24">{config.label}</span>
              <div className="flex-1 bg-gray-800 rounded-full h-6 overflow-hidden">
                <div
                  className={`h-full ${config.color} rounded-full flex items-center pl-3 transition-all`}
                  style={{ width: `${Math.max(pct, 8)}%` }}
                >
                  <span className="text-xs font-medium text-white whitespace-nowrap">
                    {formatted}
                  </span>
                </div>
              </div>
              <span className="text-xs text-gray-500 w-20 text-right">
                {device.sessions.toLocaleString()} sessions
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────

export function DeviceBreakdown({ devices }: DeviceBreakdownProps) {
  // Sort: high, mid, low
  const sorted = [...devices].sort((a, b) => {
    const order = { high: 0, mid: 1, low: 2 };
    return order[a.deviceClass] - order[b.deviceClass];
  });

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <h3 className="text-sm font-medium text-gray-400 mb-2">
        Device Class Breakdown
      </h3>
      <p className="text-xs text-gray-500 mb-6">
        Mid and low-end devices consistently show worse Core Web Vitals than high-end —
        this is the key insight for understanding real user experience.
      </p>
      {METRICS.map((metric) => (
        <MetricBar key={metric.key} metric={metric} devices={sorted} />
      ))}
    </div>
  );
}
