/**
 * optimistic-ui/page.tsx — Demo page for OptimisticUI components
 */

'use client';

import { OptimisticList } from '@/components/OptimisticUI/OptimisticList';
import { OptimisticLike } from '@/components/OptimisticUI/OptimisticLike';
import { OptimisticForm } from '@/components/OptimisticUI/OptimisticForm';

export default function OptimisticUIDemoPage() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-12">
      <h1 className="text-2xl font-bold">Optimistic UI Patterns</h1>
      <p className="text-gray-600">
        Every interaction updates the UI instantly. Server sync happens in the
        background. On error, changes roll back silently.
      </p>

      <section>
        <h2 className="text-lg font-semibold mb-4 border-b pb-2">Optimistic Todo List</h2>
        <OptimisticList />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4 border-b pb-2">Optimistic Like Button</h2>
        <p className="text-sm text-gray-500 mb-4">
          Click the heart — it toggles instantly. ~15% of server calls randomly fail,
          triggering a silent revert.
        </p>
        <div className="flex gap-4">
          <OptimisticLike postId="post-1" />
          <OptimisticLike postId="post-2" />
          <OptimisticLike postId="post-3" />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4 border-b pb-2">Optimistic Form</h2>
        <OptimisticForm />
      </section>
    </main>
  );
}
