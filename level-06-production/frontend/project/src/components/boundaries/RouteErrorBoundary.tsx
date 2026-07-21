/**
 * ROUTE ERROR BOUNDARY — Lightweight Section-Level Isolation
 *
 * Wraps individual route sections and reports errors with the route name
 * as context. Lighter weight than the full PerformanceErrorBoundary —
 * no performance observer subscriptions, just basic error capture.
 */

'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

// ─── Props & State ───────────────────────────────────────────────────────

interface RouteErrorBoundaryProps {
  children: ReactNode;
  route: string;
  fallback?: ReactNode;
  onError?: (error: Error, route: string) => void;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ─── Class Component ─────────────────────────────────────────────────────

export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): Partial<RouteErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { route, onError } = this.props;

    // Report with route context
    this.reportError(error, errorInfo, route);

    // User callback
    onError?.(error, route);

    if (process.env.NODE_ENV === 'development') {
      console.group(`[RouteErrorBoundary] Error in route: ${route}`);
      console.error(error);
      console.groupEnd();
    }
  }

  private async reportError(
    error: Error,
    errorInfo: ErrorInfo,
    route: string
  ) {
    try {
      await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          route,
          url: window.location.pathname,
          timestamp: new Date().toISOString(),
          severity: 'route-level',
        }),
      });
    } catch {
      // Silent fail
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="p-6 bg-gray-900 rounded-lg border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-1">
            Section Error
          </h3>
          <p className="text-sm text-gray-400 mb-3">
            The <code className="text-gray-300">{this.props.route}</code> section
            encountered an error.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
