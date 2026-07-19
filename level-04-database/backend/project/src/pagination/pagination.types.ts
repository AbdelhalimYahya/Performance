/**
 * Pagination types — shared interfaces for cursor and offset pagination.
 *
 * Cursor pagination encodes position information (id + sort value) into a
 * base64url token. The client sends this token back on the next request,
 * and the server uses it to seek to the correct position in the index.
 *
 * Why not OFFSET?
 * OFFSET scans and discards rows. At page 5000 (offset 100,000), PostgreSQL
 * reads 100,020 rows and throws away 100,000. Cursor pagination uses an
 * index seek → constant time regardless of page depth.
 */

/**
 * Options for cursor-based pagination.
 * Controls sorting, filtering, and cursor position.
 */
export interface CursorPaginationOptions {
  /** Base64url-encoded cursor from previous response. null = first page. */
  cursor?: string | null;

  /** Number of items to return per page. Clamped to [1, 100]. */
  limit: number;

  /** Column name to sort by. Must have an index. */
  sortBy: string;

  /** Sort direction — 'asc' for oldest-first, 'desc' for newest-first. */
  sortDirection: 'asc' | 'desc';

  /** Optional filter conditions applied before pagination. */
  filters?: Record<string, unknown>;
}

/**
 * Result of a cursor-based pagination query.
 * Includes navigation cursors and boolean flags for UI rendering.
 */
export interface CursorPaginationResult<T> {
  /** Items in the current page. */
  items: T[];

  /** Base64url-encoded cursor for the NEXT page. null if no more pages. */
  nextCursor: string | null;

  /** Base64url-encoded cursor for the PREVIOUS page. null if on first page. */
  prevCursor: string | null;

  /** True if there are more items after this page. */
  hasNextPage: boolean;

  /** True if there are items before this page. */
  hasPreviousPage: boolean;

  /** Total item count (optional — expensive on large tables, use sparingly). */
  total?: number;
}

/**
 * Internal cursor structure — decoded from the base64url token.
 * Contains the position marker (id + sort value) for seeking.
 */
export interface PaginationCursor {
  /** The primary key of the last item on the current page. */
  id: string;

  /** The value of the sort column for the last item. */
  sortValue: unknown;

  /** Direction of the next page request. 'next' = forward, 'prev' = backward. */
  direction: 'next' | 'prev';
}

/**
 * Result of a traditional offset-based pagination query.
 * Included for comparison benchmarking.
 */
export interface OffsetPaginationResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Head-to-head comparison of cursor vs offset performance.
 */
export interface PaginationRaceResult {
  cursor: {
    durationMs: number;
    itemCount: number;
  };
  offset: {
    durationMs: number;
    itemCount: number;
  };
  winner: 'cursor' | 'offset';
  speedupFactor: number;
}
