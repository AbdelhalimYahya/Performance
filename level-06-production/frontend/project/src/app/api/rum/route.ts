/**
 * RUM COLLECTION ENDPOINT
 *
 * Receives batched RUM metrics from the browser via sendBeacon or fetch.
 * In development: logs structured JSON to console for debugging.
 * In production: forwards to a configurable analytics service.
 *
 * Returns 204 No Content — beacon requests don't need a response body.
 */

import { NextRequest, NextResponse } from 'next/server';

// ─── Payload Validation ──────────────────────────────────────────────────

interface RumMetricPayload {
  name: string;
  value: number;
  rating: string;
  delta: number;
  id: string;
  navigationType: string;
  url: string;
  deviceMemory: number;
  hardwareConcurrency: number;
  connectionType: string;
  deviceClass: string;
  sessionId: string;
  appVersion: string;
  environment: string;
  timestamp: number;
  attribution?: Record<string, unknown>;
}

function validateMetric(metric: any): metric is RumMetricPayload {
  return (
    typeof metric === 'object' &&
    metric !== null &&
    typeof metric.name === 'string' &&
    typeof metric.value === 'number' &&
    typeof metric.rating === 'string' &&
    typeof metric.id === 'string' &&
    typeof metric.url === 'string' &&
    typeof metric.timestamp === 'number'
  );
}

// ─── Analytics Forwarding ────────────────────────────────────────────────

async function forwardToAnalytics(metrics: RumMetricPayload[]): Promise<void> {
  const endpoint = process.env.ANALYTICS_ENDPOINT;

  if (!endpoint) {
    console.warn('[RUM] No ANALYTICS_ENDPOINT configured, skipping forward');
    return;
  }

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metrics }),
    });
  } catch (error) {
    console.error('[RUM] Failed to forward to analytics:', error);
  }
}

// ─── POST Handler ────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();

    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Expected array of metrics' }, { status: 400 });
    }

    if (body.length === 0) {
      return new NextResponse(null, { status: 204 });
    }

    const validMetrics = body.filter(validateMetric);

    if (validMetrics.length === 0) {
      return NextResponse.json({ error: 'No valid metrics in payload' }, { status: 400 });
    }

    // Dev: log to console for debugging
    if (process.env.NODE_ENV !== 'production') {
      console.log('[RUM] Received metrics:', JSON.stringify(validMetrics, null, 2));
    }

    // Production: forward to analytics service
    if (process.env.NODE_ENV === 'production') {
      await forwardToAnalytics(validMetrics);
    }

    // 204 No Content — beacon requests don't need a response body
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[RUM] Error processing request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
