'use client';

import React, { useState, useEffect } from 'react';
import { RenderCounter } from './RenderCounter';

// ============================================================================
// BAD: All children re-render even if their props haven't changed
// ============================================================================

// Child 1: Does NOT use the changing prop (counter)
function StaticList() {
  const items = Array.from({ length: 100 }, (_, i) => `Item ${i}`);
  return (
    <div className="text-xs text-gray-400 max-h-20 overflow-auto">
      {items.map((item) => (
        <div key={item} className="py-0.5">{item}</div>
      ))}
    </div>
  );
}

// Child 2: Does NOT use the changing prop
function StringOperations() {
  const words = ['hello', 'world', 'performance', 'react', 'nextjs'];
  const upper = words.map((w) => w.toUpperCase()).join(', ');
  const sorted = [...words].sort().join(', ');
  return (
    <div className="text-xs text-gray-400">
      <div>Upper: {upper}</div>
      <div>Sorted: {sorted}</div>
    </div>
  );
}

// Child 3: Does NOT use the changing prop
function ExpensiveComputation() {
  let sum = 0;
  for (let i = 0; i < 1000; i++) sum += i;
  return (
    <div className="text-xs text-gray-400">
      Computed sum: {sum}
    </div>
  );
}

// Child 4: Does NOT use the changing prop
function StaticContent() {
  return (
    <div className="text-xs text-gray-400">
      This content never changes, but it still re-renders every second.
    </div>
  );
}

// Child 5: DOES use the changing prop (counter)
function CounterDisplay({ counter }: { counter: number }) {
  return (
    <div className="text-sm font-mono text-yellow-300">
      Counter: {counter}
    </div>
  );
}

// ============================================================================
// BadParent — THE PROBLEM
// ============================================================================

export function BadParent() {
  const [counter, setCounter] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCounter((c) => c + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h3 className="text-sm font-bold text-red-400 mb-3">
        BAD: All 5 children re-render every second
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        Only Child 5 uses the counter, but all 5 re-render because the parent state changes.
      </p>
      <div className="space-y-3">
        <RenderCounter label="Child 1: StaticList (doesn't use counter)">
          <StaticList />
        </RenderCounter>
        <RenderCounter label="Child 2: StringOperations (doesn't use counter)">
          <StringOperations />
        </RenderCounter>
        <RenderCounter label="Child 3: ExpensiveComputation (doesn't use counter)">
          <ExpensiveComputation />
        </RenderCounter>
        <RenderCounter label="Child 4: StaticContent (doesn't use counter)">
          <StaticContent />
        </RenderCounter>
        <RenderCounter label="Child 5: CounterDisplay (uses counter)">
          <CounterDisplay counter={counter} />
        </RenderCounter>
      </div>
    </div>
  );
}
