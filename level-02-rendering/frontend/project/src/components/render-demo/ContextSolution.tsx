'use client';

import React, { createContext, useContext, useState, useMemo } from 'react';
import { RenderCounter } from './RenderCounter';

// ============================================================================
// Context Solution: Split contexts so only relevant consumers re-render
// ============================================================================

interface UserData {
  name: string;
  email: string;
}

interface CartItem {
  id: number;
  name: string;
  quantity: number;
}

// Split into 4 separate contexts
const UserContext = createContext<UserData>({ name: '', email: '' });
const ThemeContext = createContext('light');
const NotificationsContext = createContext<string[]>([]);
const CartContext = createContext<CartItem[]>([]);

// Consumer 1: Only subscribes to UserContext
function UserProfile() {
  const user = useContext(UserContext);
  return (
    <div className="text-xs text-gray-400">
      <div className="font-medium text-white">{user.name}</div>
      <div>{user.email}</div>
    </div>
  );
}

// Consumer 2: Only subscribes to ThemeContext
function ThemeDisplay() {
  const theme = useContext(ThemeContext);
  return (
    <div className="text-xs text-gray-400">
      Current theme: <span className="text-white">{theme}</span>
    </div>
  );
}

// Consumer 3: Only subscribes to NotificationsContext
function NotificationList() {
  const notifications = useContext(NotificationsContext);
  return (
    <div className="text-xs text-gray-400 max-h-16 overflow-auto">
      {notifications.map((n, i) => (
        <div key={i} className="py-0.5">{n}</div>
      ))}
    </div>
  );
}

// Consumer 4: Only subscribes to CartContext
function CartSummary() {
  const cart = useContext(CartContext);
  const total = cart.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <div className="text-xs text-gray-400">
      Cart items: <span className="text-white">{total}</span>
    </div>
  );
}

// ============================================================================
// ContextSolution — THE FIX
// ============================================================================

export function ContextSolution() {
  const [cart, setCart] = useState<CartItem[]>([
    { id: 1, name: 'Widget', quantity: 2 },
    { id: 2, name: 'Gadget', quantity: 1 },
  ]);

  // useMemo prevents creating new context values on every render
  const userValue = useMemo(() => ({
    name: 'John Doe',
    email: 'john@example.com',
  }), []);

  const themeValue = useMemo(() => 'dark', []);
  const notificationsValue = useMemo(() => [
    'New message',
    'Order shipped',
    'Payment received',
  ], []);

  // Cart value changes when cart state changes — this is expected
  const cartValue = useMemo(() => cart, [cart]);

  const addToCart = () => {
    setCart((prev) => [
      ...prev,
      { id: Date.now(), name: `Item ${prev.length + 1}`, quantity: 1 },
    ]);
  };

  return (
    <UserContext.Provider value={userValue}>
      <ThemeContext.Provider value={themeValue}>
        <NotificationsContext.Provider value={notificationsValue}>
          <CartContext.Provider value={cartValue}>
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h3 className="text-sm font-bold text-green-400 mb-3">
                CONTEXT FIX: Only CartSummary re-renders when cart changes
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                Split contexts isolate changes. User, Theme, and Notifications stay stable.
              </p>
              <div className="space-y-3">
                <RenderCounter label="UserProfile (UserContext — stable, skipped)">
                  <UserProfile />
                </RenderCounter>
                <RenderCounter label="ThemeDisplay (ThemeContext — stable, skipped)">
                  <ThemeDisplay />
                </RenderCounter>
                <RenderCounter label="NotificationList (NotificationsContext — stable, skipped)">
                  <NotificationList />
                </RenderCounter>
                <RenderCounter label="CartSummary (CartContext — re-renders correctly)">
                  <CartSummary />
                </RenderCounter>
              </div>
              <button
                onClick={addToCart}
                className="mt-3 px-3 py-1 bg-green-700 hover:bg-green-600 text-white text-xs rounded"
              >
                Add to Cart (only CartSummary re-renders)
              </button>
            </div>
          </CartContext.Provider>
        </NotificationsContext.Provider>
      </ThemeContext.Provider>
    </UserContext.Provider>
  );
}
