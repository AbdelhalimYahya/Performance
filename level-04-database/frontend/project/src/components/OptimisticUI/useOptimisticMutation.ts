/**
 * useOptimisticMutation.ts — Generic optimistic mutation hook
 *
 * Wraps React Query's useMutation with a full optimistic lifecycle:
 * onMutate → onError (rollback) → onSettled (invalidate).
 *
 * Usage:
 *   const { mutate, isOptimistic } = useOptimisticMutation({
 *     mutationFn: updateTodo,
 *     getCacheKey: ['todos'],
 *     applyOptimistic: (old, vars) => old.map(t => t.id === vars.id ? { ...t, ...vars } : t),
 *     rollback: (snapshot) => snapshot,
 *   });
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

// ============================================================================
// Types
// ============================================================================

interface UseOptimisticMutationOptions<TData, TVariables, TContext> {
  /** The function that sends the mutation to the server. */
  mutationFn: (variables: TVariables) => Promise<TData>;

  /** Query key to update optimistically and invalidate after. */
  getCacheKey: unknown[];

  /**
   * Pure function: given the current cache data and mutation variables,
   * return the optimistically updated data.
   */
  applyOptimistic: (currentData: any, variables: TVariables) => any;

  /**
   * Given the snapshot returned by onMutate, restore the cache to
   * its previous state. Usually just returns the snapshot directly.
   */
  rollback: (snapshot: TContext) => any;

  /** Optional: called on success before invalidateQueries. */
  onSuccess?: (data: TData, variables: TVariables) => void;

  /** Optional: called on error (after rollback). */
  onError?: (error: Error, variables: TVariables) => void;
}

interface UseOptimisticMutationResult<TData, TVariables> {
  mutate: (variables: TVariables) => void;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  isOptimistic: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useOptimisticMutation<TData, TVariables, TContext = any>(
  options: UseOptimisticMutationOptions<TData, TVariables, TContext>,
): UseOptimisticMutationResult<TData, TVariables> {
  const queryClient = useQueryClient();
  const { mutationFn, getCacheKey, applyOptimistic, rollback, onSuccess, onError } = options;

  const mutation = useMutation({
    mutationFn,

    onMutate: async (variables) => {
      // 1. Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: getCacheKey });

      // 2. Snapshot current cache
      const previousData = queryClient.getQueryData(getCacheKey);

      // 3. Optimistically update
      queryClient.setQueryData(getCacheKey, (old: any) =>
        applyOptimistic(old, variables),
      );

      // 4. Return snapshot for rollback
      return { previousData } as TContext;
    },

    onError: (err: Error, _variables, context) => {
      // Rollback to snapshot
      if (context) {
        queryClient.setQueryData(getCacheKey, rollback(context));
      }
      onError?.(err, _variables);
    },

    onSettled: (_data, _error, _variables, context) => {
      // Always refetch to sync with server truth
      queryClient.invalidateQueries({ queryKey: getCacheKey });
      onSuccess?.(_data!, _variables);
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isOptimistic: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
  };
}
