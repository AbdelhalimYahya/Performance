/**
 * WITH ERROR BOUNDARY — HOC for Component-Level Isolation
 *
 * Higher-order component that wraps any component with
 * PerformanceErrorBoundary. Provides a clean API for adding
 * error boundaries to individual components.
 */

'use client';

import React, { ComponentType } from 'react';
import { PerformanceErrorBoundary } from './PerformanceErrorBoundary';
import { PerformanceSnapshot } from './usePerformanceContext';

// ─── Options ─────────────────────────────────────────────────────────────

interface WithErrorBoundaryOptions {
  fallback?: React.ReactNode;
  onError?: (error: Error, context: PerformanceSnapshot) => void;
  name: string;
}

// ─── HOC Implementation ──────────────────────────────────────────────────

export function withErrorBoundary<P extends object>(
  Component: ComponentType<P>,
  options: WithErrorBoundaryOptions
) {
  const WrappedComponent = (props: P) => (
    <PerformanceErrorBoundary
      fallback={options.fallback}
      onError={options.onError}
    >
      <Component {...props} />
    </PerformanceErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${options.name})`;
  return WrappedComponent;
}

// ─── Convenience: Default Fallback ───────────────────────────────────────

export function DefaultFallback({ name }: { name: string }) {
  return (
    <div className="p-6 bg-gray-900 rounded-lg border border-gray-800">
      <h3 className="text-lg font-semibold text-white mb-1">
        Component Error
      </h3>
      <p className="text-sm text-gray-400 mb-3">
        The <code className="text-gray-300">{name}</code> component crashed.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
      >
        Reload Page
      </button>
    </div>
  );
}
