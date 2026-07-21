/**
 * ERROR REPORT COLLECTION ENDPOINT
 *
 * POST endpoint receiving error reports with performance context.
 * In development: logs structured JSON to console.
 * In production: stores in database or forwards to error tracking service.
 *
 * Returns 204 No Content — fire-and-forget from client.
 */

import { NextRequest, NextResponse } from 'next/server';

// ─── Payload Validation ──────────────────────────────────────────────────

interface ErrorReport {
  message: string;
  stack?: string;
  componentStack?: string;
  performance?: {
    lastLCP: { value: number; element: string } | null;
    clsScore: number;
    clsCount: number;
    lastINP: { eventType: string; duration: number } | null;
    longTaskCount: number;
    memoryUsage: { usedJSHeapSize: number; totalJSHeapSize: number } | null;
    timeSinceNavigation: number;
  };
  route?: string;
  url: string;
  timestamp: string;
  severity?: string;
}

function validateReport(report: any): report is ErrorReport {
  return (
    typeof report === 'object' &&
    report !== null &&
    typeof report.message === 'string' &&
    typeof report.url === 'string' &&
    typeof report.timestamp === 'string'
  );
}

// ─── POST Handler ────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();

    if (!validateReport(body)) {
      return NextResponse.json(
        { error: 'Invalid error report payload' },
        { status: 400 }
      );
    }

    // Structured logging — always log for observability
    console.error('[ERROR_REPORT]', JSON.stringify({
      message: body.message,
      url: body.url,
      route: body.route || 'unknown',
      severity: body.severity || 'component-level',
      timestamp: body.timestamp,
      performance: body.performance || null,
      stack: body.stack?.split('\n').slice(0, 5).join('\n'),
    }));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[ERROR_REPORT] Failed to process:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
