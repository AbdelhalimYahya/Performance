/**
 * PERFORMANCE ERROR BOUNDARY
 *
 * Class component that catches JavaScript errors anywhere in the child tree.
 * Captures performance context at the moment of error for correlation analysis.
 *
 * In development: shows full error stack + performance debug panel.
 * In production: shows clean error screen and reports to /api/errors.
 */

'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { usePerformanceContext, PerformanceSnapshot } from './usePerformanceContext';

// ─── Props & State ───────────────────────────────────────────────────────

interface PerformanceErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, context: PerformanceSnapshot) => void;
}

interface PerformanceErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  performanceContext: PerformanceSnapshot | null;
}

// ─── Inner Component (uses hook via wrapper) ─────────────────────────────

interface InnerProps extends PerformanceErrorBoundaryProps {
  getSnapshot: () => PerformanceSnapshot;
}

class InnerBoundary extends Component<InnerProps, PerformanceErrorBoundaryState> {
  state: PerformanceErrorBoundaryState = {
    hasError: false,
    error: null,
    performanceContext: null,
  };

  static getDerivedStateFromError(error: Error): Partial<PerformanceErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Capture performance context at the moment of error
    const perfContext = this.props.getSnapshot();

    this.setState({ performanceContext: perfContext });

    // Report to backend
    this.reportError(error, errorInfo, perfContext);

    // User-provided callback
    this.props.onError?.(error, perfContext);

    if (process.env.NODE_ENV === 'development') {
      console.group('[PerformanceErrorBoundary] Error caught');
      console.error(error);
      console.log('Performance context:', perfContext);
      console.log('Component stack:', errorInfo.componentStack);
      console.groupEnd();
    }
  }

  private async reportError(
    error: Error,
    errorInfo: ErrorInfo,
    perfContext: PerformanceSnapshot
  ) {
    try {
      await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          performance: perfContext,
          url: window.location.pathname,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // Silent fail — don't crash the error handler
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-[200px] flex flex-col items-center justify-center p-8 bg-gray-900 rounded-lg border border-gray-800">
          <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
          <p className="text-gray-400 text-sm mb-4 text-center max-w-md">
            An unexpected error occurred. You can try reloading the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
          >
            Reload Page
          </button>

          {/* Debug panel — development only */}
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <div className="mt-6 w-full max-w-2xl text-left">
              <details className="bg-gray-950 rounded p-4 text-xs">
                <summary className="text-gray-300 cursor-pointer font-medium mb-2">
                  Debug Info
                </summary>
                <div className="space-y-3">
                  <div>
                    <span className="text-red-400 font-medium">Error: </span>
                    <span className="text-gray-300">{this.state.error.message}</span>
                  </div>
                  <pre className="text-gray-500 overflow-auto max-h-32">
                    {this.state.error.stack}
                  </pre>
                  {this.state.performanceContext && (
                    <div>
                      <span className="text-yellow-400 font-medium">
                        Performance Context:
                      </span>
                      <pre className="text-gray-400 mt-1">
                        {JSON.stringify(this.state.performanceContext, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// ─── Wrapper Component (bridges hook to class component) ──────────────────

export function PerformanceErrorBoundary(props: PerformanceErrorBoundaryProps) {
  const { getSnapshot } = usePerformanceContext();
  return <InnerBoundary {...props} getSnapshot={getSnapshot} />;
}
