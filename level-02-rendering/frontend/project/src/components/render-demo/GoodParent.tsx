'use client';

import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import { RenderCounter } from './RenderCounter';

// ============================================================================
// Optimization 1: Context Split — Isolate the changing value
// ============================================================================

const CounterContext = createContext(0);

// ============================================================================
// GOOD: Only children that depend on the counter re-render
// ============================================================================

// Child 1: Wrapped with React.memo — doesn't re-render when counter changes
const StaticList = React.memo(function StaticList() {
  const items = useMemo(() => Array.from({ length: 100 }, (_, i) => `Item ${i}`), []);
  return (
    <div className="text-xs text-gray-400 max-h-20 overflow-auto">
      {items.map((item) => (
        <div key={item} className="py-0.5">{item}</div>
      ))}
    </div>
  );
});

// Child 2: Wrapped with React.memo
const StringOperations = React.memo(function StringOperations() {
  const result = useMemo(() => {
    const words = ['hello', 'world', 'performance', 'react', 'nextjs'];
    return {
      upper: words.map((w) => w.toUpperCase()).join(', '),
      sorted: [...words].sort().join(', '),
    };
  }, []);

  return (
    <div className="text-xs text-gray-400">
      <div>Upper: {result.upper}</div>
      <div>Sorted: {result.sorted}</div>
    </div>
  );
});

// Child 3: Wrapped with React.memo
const ExpensiveComputation = React.memo(function ExpensiveComputation() {
  const sum = useMemo(() => {
    let s = 0;
    for (let i = 0; i < 1000; i++) s += i;
    return s;
  }, []);

  return (
    <div className="text-xs text-gray-400">
      Computed sum: {sum}
    </div>
  );
});

// Child 4: Wrapped with React.memo
const StaticContent = React.memo(function StaticContent() {
  return (
    <div className="text-xs text-gray-400">
      This content never changes. With React.memo, it does NOT re-render.
    </div>
  );
});

// Child 5: Consumes context directly — only this component re-renders
function CounterDisplay() {
  const counter = useContext(CounterContext);
  return (
    <div className="text-sm font-mono text-green-300">
      Counter: {counter}
    </div>
  );
}

// ============================================================================
// GoodParent — THE FIX
// ============================================================================

export function GoodParent() {
  const [counter, setCounter] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCounter((c) => c + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Optimization 2: useCallback — stable function reference
  const handleIncrement = useCallback(() => {
    setCounter((c) => c + 1);
  }, []);

  return (
    <CounterContext.Provider value={counter}>
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h3 className="text-sm font-bold text-green-400 mb-3">
          GOOD: Only Child 5 (CounterDisplay) re-renders
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          React.memo prevents unnecessary re-renders. Context isolates the changing value.
        </p>
        <div className="space-y-3">
          <RenderCounter label="Child 1: StaticList (React.memo — skipped)">
            <StaticList />
          </RenderCounter>
          <RenderCounter label="Child 2: StringOperations (React.memo — skipped)">
            <StringOperations />
          </RenderCounter>
          <RenderCounter label="Child 3: ExpensiveComputation (React.memo — skipped)">
            <ExpensiveComputation />
          </RenderCounter>
          <RenderCounter label="Child 4: StaticContent (React.memo — skipped)">
            <StaticContent />
          </RenderCounter>
          <RenderCounter label="Child 5: CounterDisplay (context consumer — renders)">
            <CounterDisplay />
          </RenderCounter>
        </div>
        <button
          onClick={handleIncrement}
          className="mt-3 px-3 py-1 bg-green-700 hover:bg-green-600 text-white text-xs rounded"
        >
          Increment (useCallback)
        </button>
      </div>
    </CounterContext.Provider>
  );
}
