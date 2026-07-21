/**
 * CORE WEB VITALS MONITORING DASHBOARD — Server Component
 *
 * Fetches aggregated RUM data from /api/rum/stats and passes it to client
 * components as props. No client-side fetch on initial load — data arrives
 * from the server.
 */

import { VitalsOverview } from './components/VitalsOverview';
import { TrendChart } from './components/TrendChart';
import { DeviceBreakdown } from './components/DeviceBreakdown';
import { PageBreakdown } from './components/PageBreakdown';

// ─── Types ───────────────────────────────────────────────────────────────

interface DailyMetric {
  date: string;
  lcp: number;
  inp: number;
  cls: number;
  fcp: number;
  ttfb: number;
  tbt: number;
}

interface DeviceMetric {
  deviceClass: 'high' | 'mid' | 'low';
  lcp: number;
  inp: number;
  cls: number;
  fcp: number;
  ttfb: number;
  sessions: number;
}

interface PageMetric {
  url: string;
  lcp: number;
  inp: number;
  cls: number;
  sessions: number;
  trend: number; // percentage change vs last week
}

interface RUMStats {
  summary: {
    lcp: { p75: number; rating: string; trend: number };
    inp: { p75: number; rating: string; trend: number };
    cls: { p75: number; rating: string; trend: number };
    fcp: { p75: number; rating: string; trend: number };
    ttfb: { p75: number; rating: string; trend: number };
    tbt: { p75: number; rating: string; trend: number };
  };
  daily: DailyMetric[];
  devices: DeviceMetric[];
  pages: PageMetric[];
  lastUpdated: string;
}

// ─── Data Fetching ───────────────────────────────────────────────────────

async function getRUMStats(): Promise<RUMStats> {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const res = await fetch(`${baseUrl}/api/rum/stats`, {
    cache: 'no-store', // Always fresh data for monitoring dashboard
  });

  if (!res.ok) throw new Error('Failed to fetch RUM stats');
  return res.json();
}

// ─── Page Component ──────────────────────────────────────────────────────

export default async function DashboardPage() {
  const stats = await getRUMStats();

  const formatTimestamp = (ts: string) => {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">Performance Dashboard</h1>
        <p className="text-gray-400 mt-1">
          Last updated: {formatTimestamp(stats.lastUpdated)}
        </p>
      </header>

      {/* Metric Cards */}
      <section className="mb-8">
        <VitalsOverview summary={stats.summary} />
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <TrendChart daily={stats.daily} metric="lcp" label="LCP" color="#3b82f6" />
        <TrendChart daily={stats.daily} metric="inp" label="INP" color="#f59e0b" />
        <TrendChart daily={stats.daily} metric="cls" label="CLS" color="#10b981" />
        <DeviceBreakdown devices={stats.devices} />
      </section>

      {/* Page Breakdown Table */}
      <section>
        <PageBreakdown pages={stats.pages} />
      </section>
    </main>
  );
}
