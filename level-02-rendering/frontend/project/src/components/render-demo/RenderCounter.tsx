'use client';

import React, { useRef, useEffect, useState } from 'react';

// ============================================================================
// useRenderCount Hook
// ============================================================================

/**
 * Hook that tracks how many times a component has rendered.
 * Returns the current render count and whether the component just re-rendered.
 */
export function useRenderCount(): { count: number; didFlash: boolean } {
  const countRef = useRef(0);
  const [flash, setFlash] = useState(false);

  countRef.current += 1;

  useEffect(() => {
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 300);
    return () => clearTimeout(timer);
  });

  return { count: countRef.current, didFlash: flash };
}

// ============================================================================
// RenderBadge Component
// ============================================================================

function RenderBadge({ count, didFlash }: { count: number; didFlash: boolean }) {
  return (
    <div
      className={`absolute top-1 right-1 px-2 py-0.5 rounded text-xs font-mono z-10 transition-colors ${
        didFlash
          ? 'bg-red-500 text-white'
          : 'bg-gray-700 text-gray-300'
      }`}
    >
      Renders: {count}
    </div>
  );
}

// ============================================================================
// withRenderCounter HOC
// ============================================================================

/**
 * HOC that wraps a component and shows a render count badge.
 * The badge flashes red on each render.
 */
export function withRenderCounter<P extends object>(
  WrappedComponent: React.ComponentType<P>
): React.FC<P> {
  function WithRenderCounter(props: P) {
    const { count, didFlash } = useRenderCount();

    return (
      <div className="relative">
        <RenderBadge count={count} didFlash={didFlash} />
        <WrappedComponent {...props} />
      </div>
    );
  }

  WithRenderCounter.displayName = `WithRenderCounter(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
  return WithRenderCounter;
}

// ============================================================================
// RenderCounter Wrapper Component (for inline usage)
// ============================================================================

export function RenderCounter({ children, label }: { children: React.ReactNode; label?: string }) {
  const { count, didFlash } = useRenderCount();

  return (
    <div className="relative">
      <RenderBadge count={count} didFlash={didFlash} />
      {label && (
        <div className="text-xs text-gray-500 mb-1 px-1">{label}</div>
      )}
      {children}
    </div>
  );
}
