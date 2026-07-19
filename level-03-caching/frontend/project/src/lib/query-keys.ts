/**
 * query-keys.ts — Hierarchical query key factory
 *
 * Query keys are the backbone of React Query's cache system. A structured
 * factory ensures:
 *
 *   1. Consistent keys across components (no typo-induced duplicates)
 *   2. Easy targeted invalidation via prefix matching
 *   3. Self-documenting data hierarchy
 *
 * Hierarchy pattern:
 *   [resource]               → all data for a resource
 *   [resource, 'lists']      → all list queries for that resource
 *   [resource, 'list', …]    → a specific list with filters
 *   [resource, 'details']    → all detail queries
 *   [resource, 'detail', id] → a specific detail
 *
 * Invalidation examples:
 *   invalidateQueries({ queryKey: products.all() })          → all product queries
 *   invalidateQueries({ queryKey: products.lists() })        → all product list queries
 *   invalidateQueries({ queryKey: products.detail(id) })     → one specific product
 */

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const products = {
  /** Root key for all product-related queries. */
  all: () => ['products'] as const,

  /** All product list queries (regardless of filters). */
  lists: () => [...products.all(), 'list'] as const,

  /**
   * A specific product list with filters.
   * @example products.list({ category: 'electronics', page: 1 })
   */
  list: (filters: Record<string, unknown>) =>
    [...products.lists(), filters] as const,

  /** All product detail queries. */
  details: () => [...products.all(), 'detail'] as const,

  /**
   * A single product by ID.
   * @example products.detail('prod_123')
   */
  detail: (id: string) => [...products.details(), id] as const,
};

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const categories = {
  /** Root key for all category queries. */
  all: () => ['categories'] as const,

  /** Category list. */
  list: () => [...categories.all(), 'list'] as const,
};

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export const user = {
  /** Root key for all user-related queries. */
  all: () => ['user'] as const,

  /** Current user's profile. */
  profile: () => [...user.all(), 'profile'] as const,

  /** Current user's settings / preferences. */
  settings: () => [...user.all(), 'settings'] as const,

  /** Current user's notification list. */
  notifications: () => [...user.all(), 'notifications'] as const,
};

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export const cart = {
  /** Root key for all cart queries. */
  all: () => ['cart'] as const,

  /** Cart line items. */
  items: () => [...cart.all(), 'items'] as const,

  /** Cart summary (totals, tax, shipping estimate). */
  summary: () => [...cart.all(), 'summary'] as const,
};

// ---------------------------------------------------------------------------
// Aggregate key map & type
// ---------------------------------------------------------------------------

/**
 * Full key map — useful for programmatic access or devtools.
 * @example QueryKeys.products.detail('123')
 */
export const QueryKeys = { products, categories, user, cart } as const;

/**
 * Union of all valid query key tuples.
 * Use this when you need to type a queryKey parameter.
 */
export type QueryKeyTuple =
  | ReturnType<typeof products.all>
  | ReturnType<typeof products.lists>
  | ReturnType<typeof products.list>
  | ReturnType<typeof products.details>
  | ReturnType<typeof products.detail>
  | ReturnType<typeof categories.all>
  | ReturnType<typeof categories.list>
  | ReturnType<typeof user.profile>
  | ReturnType<typeof user.settings>
  | ReturnType<typeof user.notifications>
  | ReturnType<typeof cart.items>
  | ReturnType<typeof cart.summary>;
