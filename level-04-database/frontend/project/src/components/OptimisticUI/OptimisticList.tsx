/**
 * OptimisticList.tsx — Todo list with optimistic add/edit/delete/reorder
 *
 * Demonstrates the full optimistic UI lifecycle for a CRUD list.
 * Every operation updates the UI instantly and syncs in the background.
 */

'use client';

import { useState, useRef } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';

// ============================================================================
// Types
// ============================================================================

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  order: number;
  _status?: 'saving' | 'deleting' | 'reordering' | 'error';
}

// ============================================================================
// Mock API
// ============================================================================

let nextId = 100;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchTodos(): Promise<Todo[]> {
  await delay(100);
  return [
    { id: '1', text: 'Buy groceries', completed: false, order: 0 },
    { id: '2', text: 'Walk the dog', completed: true, order: 1 },
    { id: '3', text: 'Write code', completed: false, order: 2 },
  ];
}

async function createTodo(text: string): Promise<Todo> {
  await delay(800);
  if (Math.random() < 0.1) throw new Error('Server error');
  return { id: String(nextId++), text, completed: false, order: Date.now() };
}

async function updateTodo(todo: Todo): Promise<Todo> {
  await delay(600);
  return todo;
}

async function deleteTodo(id: string): Promise<void> {
  await delay(500);
  if (Math.random() < 0.1) throw new Error('Delete failed');
}

const TODOS_KEY = ['todos'];

// ============================================================================
// Component
// ============================================================================

export function OptimisticList() {
  const queryClient = useQueryClient();
  const [newText, setNewText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: todos = [] } = useQuery({
    queryKey: TODOS_KEY,
    queryFn: fetchTodos,
  });

  // --- Add ---
  const addMutation = useMutation({
    mutationFn: (text: string) => createTodo(text),
    onMutate: async (text) => {
      await queryClient.cancelQueries({ queryKey: TODOS_KEY });
      const previous = queryClient.getQueryData(TODOS_KEY);
      const optimistic: Todo = {
        id: `temp-${Date.now()}`,
        text,
        completed: false,
        order: Date.now(),
        _status: 'saving',
      };
      queryClient.setQueryData(TODOS_KEY, (old: Todo[]) => [optimistic, ...old]);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(TODOS_KEY, ctx?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TODOS_KEY });
    },
  });

  // --- Toggle ---
  const toggleMutation = useMutation({
    mutationFn: (todo: Todo) => updateTodo({ ...todo, completed: !todo.completed }),
    onMutate: async (todo) => {
      await queryClient.cancelQueries({ queryKey: TODOS_KEY });
      const previous = queryClient.getQueryData(TODOS_KEY);
      queryClient.setQueryData(TODOS_KEY, (old: Todo[]) =>
        old.map((t) => (t.id === todo.id ? { ...t, completed: !t.completed } : t)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(TODOS_KEY, ctx?.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: TODOS_KEY }),
  });

  // --- Delete ---
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTodo(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: TODOS_KEY });
      const previous = queryClient.getQueryData(TODOS_KEY);
      queryClient.setQueryData(TODOS_KEY, (old: Todo[]) =>
        old.map((t) => (t.id === id ? { ...t, _status: 'deleting' } : t)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(TODOS_KEY, ctx?.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: TODOS_KEY }),
  });

  const handleAdd = () => {
    if (!newText.trim()) return;
    addMutation.mutate(newText.trim());
    setNewText('');
    inputRef.current?.focus();
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <h2 className="text-lg font-bold mb-4">Optimistic Todo List</h2>

      {/* Add form */}
      <div className="flex gap-2 mb-4">
        <input
          ref={inputRef}
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="New todo..."
          className="flex-1 px-3 py-2 border rounded text-sm"
        />
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          Add
        </button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {todos.map((todo) => {
          const isDeleting = todo._status === 'deleting';
          const isSaving = todo._status === 'saving';
          const isTemp = todo.id.startsWith('temp-');

          return (
            <div
              key={todo.id}
              className={`flex items-center gap-3 p-3 border rounded transition-all duration-200 ${
                isDeleting ? 'opacity-40 line-through' : ''
              } ${isSaving ? 'bg-blue-50 border-blue-200' : ''}`}
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleMutation.mutate(todo)}
                disabled={isTemp || isDeleting}
                className="rounded"
              />

              {/* Text */}
              <span
                className={`flex-1 text-sm ${
                  todo.completed ? 'line-through text-gray-400' : ''
                }`}
              >
                {todo.text}
              </span>

              {/* Status badge */}
              {isSaving && (
                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded animate-pulse">
                  Saving...
                </span>
              )}
              {isDeleting && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                  Deleting...
                </span>
              )}

              {/* Delete */}
              {!isTemp && (
                <button
                  onClick={() => deleteMutation.mutate(todo.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
