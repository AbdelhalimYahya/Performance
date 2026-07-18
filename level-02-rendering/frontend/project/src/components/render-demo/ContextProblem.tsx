'use client';

import React, { createContext, useContext, useState } from 'react';
import { RenderCounter } from './RenderCounter';

// ============================================================================
// Context Problem: One context, all consumers re-render
// ============================================================================

interface AppContextValue {
  user: { name: string; email: string };
  theme: string;
  notifications: string[];
  cart: { id: number; name: string; quantity: number }[];
}

const AppContext = createContext<AppContextValue | null>(null);

// Consumer 1: Only uses user
function UserProfile() {
  const ctx = useContext(AppContext);
  return (
    <div className="text-xs text-gray-400">
      <div className="font-medium text-white">{ctx?.user.name}</div>
      <div>{ctx?.user.email}</div>
    </div>
  );
}

// Consumer 2: Only uses theme
function ThemeDisplay() {
  const ctx = useContext(AppContext);
  return (
    <div className="text-xs text-gray-400">
      Current theme: <span className="text-white">{ctx?.theme}</span>
    </div>
  );
}

// Consumer 3: Only uses notifications
function NotificationList() {
  const ctx = useContext(AppContext);
  return (
    <div className="text-xs text-gray-400 max-h-16 overflow-auto">
      {ctx?.notifications.map((n, i) => (
        <div key={i} className="py-0.5">{n}</div>
      ))}
    </div>
  );
}

// Consumer 4: Only uses cart
function CartSummary() {
  const ctx = useContext(AppContext);
  const total = ctx?.cart.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  return (
    <div className="text-xs text-gray-400">
      Cart items: <span className="text-white">{total}</span>
    </div>
  );
}

// ============================================================================
// ContextProblem — THE PROBLEM
// ============================================================================

export function ContextProblem() {
  const [cart, setCart] = useState([
    { id: 1, name: 'Widget', quantity: 2 },
    { id: 2, name: 'Gadget', quantity: 1 },
  ]);

  const contextValue: AppContextValue = {
    user: { name: 'John Doe', email: 'john@example.com' },
    theme: 'dark',
    notifications: ['New message', 'Order shipped', 'Payment received'],
    cart,
  };

  const addToCart = () => {
    setCart((prev) => [
      ...prev,
      { id: Date.now(), name: `Item ${prev.length + 1}`, quantity: 1 },
    ]);
  };

  return (
    <AppContext.Provider value={contextValue}>
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h3 className="text-sm font-bold text-red-400 mb-3">
          CONTEXT PROBLEM: Changing cart re-renders ALL 4 consumers
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          All 4 components consume the same context. When cart changes, all re-render.
        </p>
        <div className="space-y-3">
          <RenderCounter label="UserProfile (only uses user — but re-renders)">
            <UserProfile />
          </RenderCounter>
          <RenderCounter label="ThemeDisplay (only uses theme — but re-renders)">
            <ThemeDisplay />
          </RenderCounter>
          <RenderCounter label="NotificationList (only uses notifications — but re-renders)">
            <NotificationList />
          </RenderCounter>
          <RenderCounter label="CartSummary (uses cart — re-renders correctly)">
            <CartSummary />
          </RenderCounter>
        </div>
        <button
          onClick={addToCart}
          className="mt-3 px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-xs rounded"
        >
          Add to Cart (all 4 re-render)
        </button>
      </div>
    </AppContext.Provider>
  );
}
