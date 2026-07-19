/**
 * OptimisticForm.tsx — Form with optimistic submission and offline queue
 *
 * Shows submitted data immediately in a list with "Syncing..." badge.
 * On error: "Failed — Retry" badge. On offline: queue and replay.
 */

'use client';

import { useState, useCallback } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';

// ============================================================================
// Types & Mock
// ============================================================================

interface SubmittedItem {
  id: string;
  title: string;
  body: string;
  _status: 'syncing' | 'synced' | 'failed';
  _createdAt: number;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function submitPost(data: { title: string; body: string }): Promise<SubmittedItem> {
  await delay(1000);
  if (Math.random() < 0.2) throw new Error('Server error');
  return {
    id: String(Date.now()),
    title: data.title,
    body: data.body,
    _status: 'synced',
    _createdAt: Date.now(),
  };
}

const POSTS_KEY = ['posts'];

// ============================================================================
// Component
// ============================================================================

export function OptimisticForm() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<{ title: string; body: string }[]>([]);

  const { data: posts = [] } = useQuery({
    queryKey: POSTS_KEY,
    queryFn: async (): Promise<SubmittedItem[]> => {
      await delay(200);
      return [];
    },
  });

  const submitMutation = useMutation({
    mutationFn: (data: { title: string; body: string }) => submitPost(data),

    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: POSTS_KEY });
      const previous = queryClient.getQueryData(POSTS_KEY);

      const optimistic: SubmittedItem = {
        id: `temp-${Date.now()}`,
        title: data.title,
        body: data.body,
        _status: 'syncing',
        _createdAt: Date.now(),
      };

      queryClient.setQueryData(POSTS_KEY, (old: SubmittedItem[]) => [
        optimistic,
        ...old,
      ]);

      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      // Mark the optimistic item as failed instead of removing it
      queryClient.setQueryData(POSTS_KEY, (old: SubmittedItem[]) =>
        old.map((item) =>
          item._status === 'syncing' ? { ...item, _status: 'failed' as const } : item,
        ),
      );
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: POSTS_KEY });
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim()) return;

      if (isOffline) {
        // Queue for later
        setOfflineQueue((prev) => [...prev, { title, body }]);
        setTitle('');
        setBody('');
        return;
      }

      submitMutation.mutate({ title, body });
      setTitle('');
      setBody('');
    },
    [title, body, isOffline, submitMutation],
  );

  const retryItem = useCallback(
    (item: SubmittedItem) => {
      submitMutation.mutate({ title: item.title, body: item.body });
    },
    [submitMutation],
  );

  const replayOfflineQueue = useCallback(async () => {
    for (const item of offlineQueue) {
      await submitMutation.mutateAsync(item);
    }
    setOfflineQueue([]);
  }, [offlineQueue, submitMutation]);

  return (
    <div className="max-w-lg mx-auto p-4">
      <h2 className="text-lg font-bold mb-4">Optimistic Form</h2>

      {/* Offline toggle */}
      <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 rounded">
        <input
          type="checkbox"
          id="offline"
          checked={isOffline}
          onChange={(e) => setIsOffline(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="offline" className="text-sm">
          Simulate offline mode
        </label>
        {isOffline && offlineQueue.length > 0 && (
          <button
            onClick={replayOfflineQueue}
            className="ml-auto px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
          >
            Replay queue ({offlineQueue.length})
          </button>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3 mb-6">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full px-3 py-2 border rounded text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Body"
          rows={3}
          className="w-full px-3 py-2 border rounded text-sm"
        />
        <button
          type="submit"
          disabled={!title.trim()}
          className="w-full py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {isOffline ? 'Queue for later' : 'Submit'}
        </button>
      </form>

      {/* Submitted items */}
      <div className="space-y-2">
        {posts.map((item) => (
          <div
            key={item.id}
            className={`p-3 border rounded transition-all ${
              item._status === 'synced' ? 'bg-green-50 border-green-200' :
              item._status === 'syncing' ? 'bg-blue-50 border-blue-200' :
              'bg-red-50 border-red-200'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-sm">{item.title}</div>
                <div className="text-xs text-gray-500 mt-1">{item.body}</div>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  item._status === 'synced'
                    ? 'bg-green-100 text-green-700'
                    : item._status === 'syncing'
                    ? 'bg-blue-100 text-blue-700 animate-pulse'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {item._status === 'synced'
                  ? 'Synced'
                  : item._status === 'syncing'
                  ? 'Syncing...'
                  : 'Failed'}
              </span>
            </div>
            {item._status === 'failed' && (
              <button
                onClick={() => retryItem(item)}
                className="mt-2 px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
              >
                Retry
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
