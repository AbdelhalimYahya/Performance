'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { VirtualList, VariableVirtualList } from '@/components/VirtualList';

// ============================================================================
// Types
// ============================================================================

interface ListItem {
  id: number;
  name: string;
  category: string;
  height: number;
}

// ============================================================================
// Data Generators
// ============================================================================

function generateFixedItems(count: number): ListItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: `Item ${i} — Lorem ipsum dolor sit amet`,
    category: ['Electronics', 'Clothing', 'Home', 'Sports', 'Books'][i % 5],
    height: 48,
  }));
}

function generateVariableItems(count: number): ListItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: `Item ${i} — Variable height content that can differ`,
    category: ['Electronics', 'Clothing', 'Home', 'Sports', 'Books'][i % 5],
    height: 40 + Math.floor(Math.random() * 160),
  }));
}

// ============================================================================
// FPS Counter
// ============================================================================

function useFpsCounter(): number {
  const [fps, setFps] = useState(0);
  const frameRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const countRef = useRef(0);

  useEffect(() => {
    let running = true;

    function tick() {
      if (!running) return;
      countRef.current++;
      const now = performance.now();
      if (now - lastTimeRef.current >= 1000) {
        setFps(countRef.current);
        countRef.current = 0;
        lastTimeRef.current = now;
      }
      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return fps;
}

// ============================================================================
// Naive List (non-virtualized)
// ============================================================================

function NaiveList({ items, containerHeight }: { items: ListItem[]; containerHeight: number }) {
  return (
    <div style={{ height: containerHeight, overflow: 'auto' }} className="border border-gray-700 rounded bg-gray-950">
      {items.map((item) => (
        <div key={item.id} className="flex items-center px-3 border-b border-gray-800" style={{ height: item.height }}>
          <span className="w-16 text-gray-500 text-sm">{item.id}</span>
          <span className="text-gray-300 text-sm">{item.name}</span>
          <span className="ml-auto text-gray-500 text-xs">{item.category}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main Demo Page
// ============================================================================

export default function VirtualListPage() {
  const [search, setSearch] = useState('');
  const fps = useFpsCounter();

  const fixedItems = useMemo(() => generateFixedItems(100_000), []);
  const variableItems = useMemo(() => generateVariableItems(50_000), []);
  const naiveItems = useMemo(() => generateFixedItems(500), []);

  const filteredFixed = useMemo(() => {
    if (!search) return fixedItems;
    return fixedItems.filter((item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase())
    );
  }, [fixedItems, search]);

  const renderFixedItem = (item: ListItem, index: number) => (
    <div className="flex items-center px-3 h-full border-b border-gray-800">
      <span className="w-16 text-gray-500 text-sm">{index}</span>
      <span className="text-gray-300 text-sm">{item.name}</span>
      <span className="ml-auto text-gray-500 text-xs">{item.category}</span>
    </div>
  );

  const renderVariableItem = (item: ListItem, index: number) => (
    <div className="flex items-center px-3 border-b border-gray-800" style={{ height: item.height }}>
      <span className="w-16 text-gray-500 text-sm">{index}</span>
      <span className="text-gray-300 text-sm">{item.name}</span>
      <span className="ml-auto text-gray-500 text-xs">{item.category}</span>
    </div>
  );

  const getItemHeight = (index: number): number => variableItems[index]?.height ?? 48;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Virtual List Demo</h1>
            <p className="text-gray-400 text-sm">
              Rendering 100,000 items without crashing your browser.
            </p>
          </div>
          <div className="bg-gray-800 px-4 py-2 rounded">
            <span className="text-gray-400 text-sm">FPS: </span>
            <span className={`font-mono font-bold ${fps >= 55 ? 'text-green-400' : fps >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
              {fps}
            </span>
          </div>
        </div>

        {/* Search Filter */}
        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items..."
            className="w-full max-w-md px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            {filteredFixed.length.toLocaleString()} items found
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Fixed Height Virtual List */}
          <div>
            <h2 className="text-lg font-bold text-green-400 mb-2">
              Fixed Height Virtual List
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              100,000 items, 48px each. Only ~20 rendered in DOM at any time.
            </p>
            <VirtualList
              items={filteredFixed}
              itemHeight={48}
              containerHeight={500}
              renderItem={renderFixedItem}
              overscan={5}
            />
          </div>

          {/* Variable Height Virtual List */}
          <div>
            <h2 className="text-lg font-bold text-purple-400 mb-2">
              Variable Height Virtual List
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              50,000 items, heights 40-200px. Binary search for O(log n) index lookup.
            </p>
            <VariableVirtualList
              items={variableItems}
              getItemHeight={getItemHeight}
              containerHeight={500}
              renderItem={renderVariableItem}
              overscan={3}
            />
          </div>
        </div>

        {/* Side-by-Side Comparison */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-yellow-400 mb-2">
            Naive vs Virtual Comparison
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Left: 500 items rendered naively (all in DOM). Right: 100,000 items virtualized.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm text-gray-400 mb-2">Naive (500 items)</h3>
              <NaiveList items={naiveItems} containerHeight={400} />
            </div>
            <div>
              <h3 className="text-sm text-gray-400 mb-2">Virtual (100,000 items)</h3>
              <VirtualList
                items={fixedItems}
                itemHeight={48}
                containerHeight={400}
                renderItem={renderFixedItem}
                overscan={3}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
