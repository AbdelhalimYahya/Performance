/**
 * RUM STATS API — Mock Aggregated Data
 *
 * Returns realistic mock data for the Core Web Vitals dashboard.
 * In production, this would query a database or analytics service.
 *
 * Mock values are realistic:
 * - LCP p75: ~2800ms (slightly poor — typical for many sites)
 * - INP p75: ~180ms (good)
 * - CLS p75: ~0.08 (good)
 * - FCP p75: ~1600ms (good)
 * - TTFB p75: ~600ms (good)
 * - TBT p75: ~220ms (needs improvement)
 */

import { NextResponse } from 'next/server';

// ─── Generate 30 Days of Daily p75 Data ──────────────────────────────────

function generateDailyData() {
  const days = [];
  const now = new Date();

  // Base values (realistic for a typical Next.js app)
  const base = { lcp: 2800, inp: 180, cls: 0.08, fcp: 1600, ttfb: 600, tbt: 220 };

  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Add daily variance (±15%) and a slight downward trend (improvement)
    const trend = 1 - (29 - i) * 0.003; // Very slight improvement over time
    const noise = () => 0.85 + Math.random() * 0.30;

    days.push({
      date: date.toISOString().split('T')[0],
      lcp: Math.round(base.lcp * trend * noise()),
      inp: Math.round(base.inp * trend * noise()),
      cls: parseFloat((base.cls * trend * noise()).toFixed(3)),
      fcp: Math.round(base.fcp * trend * noise()),
      ttfb: Math.round(base.ttfb * trend * noise()),
      tbt: Math.round(base.tbt * trend * noise()),
    });
  }

  return days;
}

// ─── Generate Device Breakdown ───────────────────────────────────────────

function generateDeviceData() {
  return [
    {
      deviceClass: 'high' as const,
      lcp: 1850, inp: 120, cls: 0.04, fcp: 1100, ttfb: 420,
      sessions: 15420,
    },
    {
      deviceClass: 'mid' as const,
      lcp: 2900, inp: 210, cls: 0.09, fcp: 1700, ttfb: 650,
      sessions: 28350,
    },
    {
      deviceClass: 'low' as const,
      lcp: 4200, inp: 380, cls: 0.18, fcp: 2400, ttfb: 950,
      sessions: 12830,
    },
  ];
}

// ─── Generate Page Breakdown ─────────────────────────────────────────────

function generatePageData() {
  const pages = [
    { url: '/', lcp: 1950, inp: 140, cls: 0.05, sessions: 45200, trend: -8.2 },
    { url: '/products', lcp: 2400, inp: 180, cls: 0.07, sessions: 38100, trend: -5.1 },
    { url: '/products/1', lcp: 3100, inp: 220, cls: 0.12, sessions: 12400, trend: 12.3 },
    { url: '/dashboard', lcp: 3400, inp: 280, cls: 0.15, sessions: 8900, trend: 3.7 },
    { url: '/checkout', lcp: 3800, inp: 310, cls: 0.09, sessions: 6200, trend: -2.1 },
    { url: '/profile', lcp: 2200, inp: 160, cls: 0.06, sessions: 15800, trend: -12.4 },
    { url: '/search', lcp: 2800, inp: 200, cls: 0.11, sessions: 22300, trend: 1.8 },
    { url: '/blog', lcp: 1600, inp: 130, cls: 0.04, sessions: 31200, trend: -15.2 },
    { url: '/contact', lcp: 1400, inp: 110, cls: 0.03, sessions: 9800, trend: -3.8 },
    { url: '/about', lcp: 1500, inp: 125, cls: 0.04, sessions: 11200, trend: -6.1 },
  ];
  return pages;
}

// ─── Route Handler ───────────────────────────────────────────────────────

export async function GET() {
  const daily = generateDailyData();
  const devices = generateDeviceData();
  const pages = generatePageData();

  // Calculate p75 from daily data for summary
  const avgMetric = (key: string) => {
    const vals = daily.map((d) => d[key as keyof typeof d] as number).sort((a, b) => a - b);
    const idx = Math.floor(vals.length * 0.75);
    return vals[idx];
  };

  const summary = {
    lcp: { p75: avgMetric('lcp'), rating: 'needs-improvement' as const, trend: -4.2 },
    inp: { p75: avgMetric('inp'), rating: 'good' as const, trend: -2.8 },
    cls: { p75: avgMetric('cls'), rating: 'good' as const, trend: -1.5 },
    fcp: { p75: avgMetric('fcp'), rating: 'good' as const, trend: -3.1 },
    ttfb: { p75: avgMetric('ttfb'), rating: 'good' as const, trend: -2.0 },
    tbt: { p75: avgMetric('tbt'), rating: 'needs-improvement' as const, trend: 1.2 },
  };

  return NextResponse.json({
    summary,
    daily,
    devices,
    pages,
    lastUpdated: new Date().toISOString(),
  });
}
