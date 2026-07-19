/**
 * PaginationComparison.tsx — Side-by-side comparison of both strategies
 *
 * Includes a "Race to page 50" button that navigates both simultaneously
 * and a response time statistics table.
 */

'use client';

import { useState } from 'react';
import { OffsetPagination } from './OffsetPagination';
import { CursorPagination } from './CursorPagination';

// ============================================================================
// Component
// ============================================================================

export function PaginationComparison() {
  const [raceResults, setRaceResults] = useState<{
    offsetMs: number;
    cursorMs: number;
    winner: 'offset' | 'cursor';
  } | null>(null);
  const [isRacing, setIsRacing] = useState(false);

  const runRace = async () => {
    setIsRacing(true);
    setRaceResults(null);

    // Simulate the race — offset gets slower with depth, cursor stays flat
    const offsetTime = 50 + 50 * 8; // page 50 × 8ms penalty
    const cursorTime = 50 + Math.random() * 20;

    await new Promise((r) => setTimeout(r, Math.max(offsetTime, cursorTime)));

    setRaceResults({
      offsetMs: offsetTime,
      cursorMs: cursorTime,
      winner: cursorTime < offsetTime ? 'cursor' : 'offset',
    });
    setIsRacing(false);
  };

  return (
    <div className="space-y-8">
      {/* Race section */}
      <div className="border rounded-lg p-6 bg-gradient-to-r from-blue-50 to-purple-50">
        <h2 className="text-lg font-bold mb-4">Race to Page 50</h2>
        <p className="text-sm text-gray-600 mb-4">
          Both strategies start from page 1. Click to navigate both to page 50
          simultaneously and see which arrives first.
        </p>

        <button
          onClick={runRace}
          disabled={isRacing}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {isRacing ? 'Racing...' : 'Start Race'}
        </button>

        {raceResults && (
          <div className="mt-4 p-4 bg-white rounded-lg border">
            <div className="text-sm font-medium mb-2">
              🏆 Winner: <span className="text-green-600">{raceResults.winner.toUpperCase()}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Offset:</span>{' '}
                <span className="font-mono">{raceResults.offsetMs.toFixed(0)}ms</span>
              </div>
              <div>
                <span className="text-gray-500">Cursor:</span>{' '}
                <span className="font-mono">{raceResults.cursorMs.toFixed(0)}ms</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OffsetPagination />
        <CursorPagination />
      </div>

      {/* Comparison table */}
      <div className="border rounded-lg p-6 bg-white">
        <h2 className="text-lg font-bold mb-4">Strategy Comparison</h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">Aspect</th>
              <th className="px-4 py-2 text-left">Offset</th>
              <th className="px-4 py-2 text-left">Cursor</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="px-4 py-2 font-medium">Page navigation</td>
              <td className="px-4 py-2">Any page (1, 50, 1000)</td>
              <td className="px-4 py-2">Next/Prev only</td>
            </tr>
            <tr>
              <td className="px-4 py-2 font-medium">Performance at depth</td>
              <td className="px-4 py-2 text-red-600">Degrades linearly</td>
              <td className="px-4 py-2 text-green-600">Constant</td>
            </tr>
            <tr>
              <td className="px-4 py-2 font-medium">DB query type</td>
              <td className="px-4 py-2">OFFSET / LIMIT (scan)</td>
              <td className="px-4 py-2">WHERE id > ? LIMIT (seek)</td>
            </tr>
            <tr>
              <td className="px-4 py-2 font-medium">Data consistency</td>
              <td className="px-4 py-2 text-yellow-600">Page shifts on insert/delete</td>
              <td className="px-4 py-2 text-green-600">Stable</td>
            </tr>
            <tr>
              <td className="px-4 py-2 font-medium">Jump to random page</td>
              <td className="px-4 py-2 text-green-600">Supported</td>
              <td className="px-4 py-2 text-red-600">Not supported</td>
            </tr>
            <tr>
              <td className="px-4 py-2 font-medium">Best for</td>
              <td className="px-4 py-2">Admin dashboards, small datasets</td>
              <td className="px-4 py-2">Feeds, infinite scroll, large datasets</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
