/**
 * OptimisticLike.tsx — Like button with instant toggle
 *
 * Toggles like state immediately without waiting for the server.
 * On error, silently reverts (Twitter/X behavior). Prevents double-tap.
 */

'use client';

import { useState, useCallback } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';

// ============================================================================
// Types & Mock
// ============================================================================

interface LikeData {
  liked: boolean;
  count: number;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchLikes(postId: string): Promise<LikeData> {
  await delay(50);
  return { liked: false, count: 42 };
}

async function toggleLikeApi(postId: string, liked: boolean): Promise<LikeData> {
  await delay(600);
  if (Math.random() < 0.15) throw new Error('Network error');
  return { liked, count: liked ? 43 : 42 };
}

// ============================================================================
// Component
// ============================================================================

export function OptimisticLike({ postId = 'post-1' }: { postId?: string }) {
  const queryClient = useQueryClient();
  const [isMutating, setIsMutating] = useState(false);

  const { data } = useQuery({
    queryKey: ['likes', postId],
    queryFn: () => fetchLikes(postId),
  });

  const likeMutation = useMutation({
    mutationFn: (liked: boolean) => toggleLikeApi(postId, liked),

    onMutate: async (liked) => {
      // Prevent double-tap
      if (isMutating) return;
      setIsMutating(true);

      await queryClient.cancelQueries({ queryKey: ['likes', postId] });
      const previous = queryClient.getQueryData<LikeData>(['likes', postId]);

      // Optimistic toggle
      queryClient.setQueryData<LikeData>(['likes', postId], {
        liked,
        count: liked ? (previous?.count ?? 0) + 1 : (previous?.count ?? 1) - 1,
      });

      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      // Silent revert — user may not even notice
      if (ctx?.previous) {
        queryClient.setQueryData(['likes', postId], ctx.previous);
      }
    },

    onSettled: () => {
      setIsMutating(false);
      queryClient.invalidateQueries({ queryKey: ['likes', postId] });
    },
  });

  const isLiked = data?.liked ?? false;
  const count = data?.count ?? 0;

  const handleClick = useCallback(() => {
    likeMutation.mutate(!isLiked);
  }, [isLiked, likeMutation]);

  return (
    <button
      onClick={handleClick}
      disabled={isMutating}
      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-150 ${
        isLiked
          ? 'bg-red-50 text-red-600 border border-red-200'
          : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
      } ${isMutating ? 'scale-95' : 'hover:scale-105'}`}
    >
      {/* Heart icon */}
      <svg
        className={`w-5 h-5 transition-transform ${isLiked ? 'fill-red-500' : 'fill-none stroke-current'}`}
        viewBox="0 0 24 24"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
      <span>{count}</span>
    </button>
  );
}
