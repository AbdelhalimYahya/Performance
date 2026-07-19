/**
 * page.tsx — Demo page for PaginationComparison
 */

'use client';

import { PaginationComparison } from '@/components/Pagination/PaginationComparison';

export default function PaginationDemoPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Cursor vs Offset Pagination</h1>
      <p className="text-gray-600 mb-8">
        Visual comparison demonstrating why cursor-based pagination maintains
        consistent performance while offset-based pagination degrades at depth.
      </p>
      <PaginationComparison />
    </main>
  );
}
