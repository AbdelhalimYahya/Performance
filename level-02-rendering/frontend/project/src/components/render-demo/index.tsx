'use client';

import React, { useState } from 'react';
import { BadParent } from './BadParent';
import { GoodParent } from './GoodParent';
import { ContextProblem } from './ContextProblem';
import { ContextSolution } from './ContextSolution';

type Tab = 'problem' | 'solution' | 'metrics';

const tabs: { id: Tab; label: string; color: string }[] = [
  { id: 'problem', label: 'Problem', color: 'text-red-400' },
  { id: 'solution', label: 'Solution', color: 'text-green-400' },
  { id: 'metrics', label: 'Metrics', color: 'text-blue-400' },
];

// ============================================================================
// Metrics Comparison Panel
// ============================================================================

function MetricsPanel() {
  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-blue-400 mb-4">Rendering Performance Comparison</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-900 rounded p-4 border border-gray-700">
            <h4 className="text-sm font-bold text-red-400 mb-2">Without Optimization</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Components per update</span>
                <span className="text-white font-mono">5</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Re-renders per second</span>
                <span className="text-white font-mono">5</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Wasted renders</span>
                <span className="text-red-300 font-mono">4 / second</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Context consumers affected</span>
                <span className="text-white font-mono">All 4</span>
              </div>
            </div>
          </div>
          <div className="bg-gray-900 rounded p-4 border border-gray-700">
            <h4 className="text-sm font-bold text-green-400 mb-2">With Optimization</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Components per update</span>
                <span className="text-white font-mono">1</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Re-renders per second</span>
                <span className="text-white font-mono">1</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Wasted renders</span>
                <span className="text-green-300 font-mono">0 / second</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Context consumers affected</span>
                <span className="text-white font-mono">Only 1</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-blue-400 mb-3">Optimization Techniques</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-900 rounded p-3">
            <h4 className="font-medium text-white mb-1">React.memo</h4>
            <p className="text-gray-400 text-xs">
              Wraps a component to skip re-rendering when props haven't changed (shallow comparison).
              Use for expensive components that receive stable props.
            </p>
          </div>
          <div className="bg-gray-900 rounded p-3">
            <h4 className="font-medium text-white mb-1">useCallback</h4>
            <p className="text-gray-400 text-xs">
              Memoizes function references so they don't break React.memo.
              Use when passing callbacks to memoized children.
            </p>
          </div>
          <div className="bg-gray-900 rounded p-3">
            <h4 className="font-medium text-white mb-1">useMemo</h4>
            <p className="text-gray-400 text-xs">
              Memoizes computed values. Avoids recalculating expensive derivations.
              Use for sorting, filtering, and complex computations.
            </p>
          </div>
          <div className="bg-gray-900 rounded p-3">
            <h4 className="font-medium text-white mb-1">Context Splitting</h4>
            <p className="text-gray-400 text-xs">
              Split one large context into smaller ones. Only consumers of the changed
              context re-render. Essential for performance-critical state.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Render Demo Index
// ============================================================================

export default function RenderDemoIndex() {
  const [activeTab, setActiveTab] = useState<Tab>('problem');

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-800 p-1 rounded-lg">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-750'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'problem' && (
        <div className="space-y-6">
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <h2 className="text-lg font-bold text-white mb-2">Re-render Problem</h2>
            <p className="text-sm text-gray-400">
              When parent state changes, ALL children re-render by default.
              Watch the render badges count up on every second tick.
            </p>
          </div>
          <BadParent />
          <ContextProblem />
        </div>
      )}

      {activeTab === 'solution' && (
        <div className="space-y-6">
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <h2 className="text-lg font-bold text-white mb-2">Re-render Solution</h2>
            <p className="text-sm text-gray-400">
              React.memo, useCallback, useMemo, and context splitting eliminate
              unnecessary re-renders. Only the components that need the data update.
            </p>
          </div>
          <GoodParent />
          <ContextSolution />
        </div>
      )}

      {activeTab === 'metrics' && <MetricsPanel />}
    </div>
  );
}
