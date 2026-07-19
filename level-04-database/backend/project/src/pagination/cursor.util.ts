/**
 * Cursor utilities — encode, decode, and build WHERE clauses for cursor pagination.
 *
 * Cursor format: base64url(JSON({ id, sortValue, direction }))
 * Using base64url (not base64) avoids URL-escaping issues in query params.
 *
 * WHERE clause construction:
 * For sortBy=createdAt, direction=next (descending):
 *   WHERE (createdAt < $cursorDate) OR (createdAt = $cursorDate AND id < $cursorId)
 *
 * For sortBy=createdAt, direction=prev (ascending):
 *   WHERE (createdAt > $cursorDate) OR (createdAt = $cursorDate AND id > $cursorId)
 */
import { PaginationCursor } from './pagination.types';
import { Prisma } from '@prisma/client';

/**
 * Encode a PaginationCursor into a base64url string.
 *
 * @example
 * const cursor = encodeCursor({ id: 'abc', sortValue: '2024-01-15T10:00:00Z', direction: 'next' });
 * // cursor === 'eyJpZCI6ImFiYyIsInNvcnRWYWx1ZSI6IjIwMjQtMDEtMTVUMTA6MDA6MDBaIiwiZGlyZWN0aW9uIjoibmV4dCJ9'
 */
export function encodeCursor(data: PaginationCursor): string {
  const payload = JSON.stringify({
    id: data.id,
    sortValue: data.sortValue,
    direction: data.direction,
  });
  return Buffer.from(payload).toString('base64url');
}

/**
 * Decode a base64url string back into a PaginationCursor.
 * Throws on invalid base64 or malformed JSON.
 *
 * @example
 * const cursor = decodeCursor('eyJpZCI6ImFiYyJ9');
 * // { id: 'abc', sortValue: undefined, direction: 'next' }
 */
export function decodeCursor(cursor: string): PaginationCursor {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(decoded) as Partial<PaginationCursor>;

    if (!parsed.id) {
      throw new Error('Cursor missing required field: id');
    }

    return {
      id: parsed.id,
      sortValue: parsed.sortValue ?? null,
      direction: parsed.direction ?? 'next',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(`Invalid cursor: ${message}`);
  }
}

/**
 * Build a Prisma WHERE clause for cursor-based seeking.
 *
 * The clause depends on:
 * - sortBy column (createdAt, price, name, etc.)
 * - sortDirection (asc/desc)
 * - cursor direction (next/prev)
 *
 * For 'next' with desc sort: find items BEFORE the cursor position.
 * For 'prev' with desc sort: find items AFTER the cursor position (then reverse in memory).
 *
 * @param cursor - Decoded cursor with position info
 * @param sortBy - Column name to sort by
 * @param sortDirection - 'asc' or 'desc'
 * @returns Prisma WHERE input object
 */
export function buildCursorWhereClause(
  cursor: PaginationCursor,
  sortBy: string,
  sortDirection: 'asc' | 'desc',
): Prisma.ProductWhereInput {
  const isNext = cursor.direction === 'next';
  const isDesc = sortDirection === 'desc';

  // Determine comparison operator based on direction
  // 'next' + desc = items before cursor (less than)
  // 'next' + asc  = items after cursor (greater than)
  // 'prev' + desc = items after cursor (greater than) — we reverse later
  // 'prev' + asc  = items before cursor (less than) — we reverse later
  const primaryOp = isNext === isDesc ? 'lt' : 'gt';
  const secondaryOp = isNext === isDesc ? 'gt' : 'lt';

  // Build the compound WHERE clause using Prisma's AND/OR
  // Pattern: (sortBy < cursorValue) OR (sortBy = cursorValue AND id < cursorId)
  // This handles ties correctly — multiple items with the same sort value
  const sortValueFilter = buildSortValueFilter(sortBy, cursor.sortValue, primaryOp);
  const tieBreakerFilter = buildSortValueFilter(sortBy, cursor.sortValue, 'equals');

  return {
    AND: [
      sortValueFilter,
      {
        OR: [
          tieBreakerFilter,
          { id: { [secondaryOp]: cursor.id } },
        ],
      },
    ],
  };
}

/**
 * Build a filter for a specific sort column with the given operator.
 * Handles different Prisma filter syntaxes based on the operator.
 */
function buildSortValueFilter(
  sortBy: string,
  value: unknown,
  operator: 'lt' | 'gt' | 'equals',
): Prisma.ProductWhereInput {
  if (value === null || value === undefined) {
    return {};
  }

  const filterKey = sortBy as keyof Prisma.ProductWhereInput;

  if (operator === 'equals') {
    return { [filterKey]: value } as Prisma.ProductWhereInput;
  }

  return { [filterKey]: { [operator]: value } } as Prisma.ProductWhereInput;
}

/**
 * Build the ORDER BY clause for Prisma based on sort configuration.
 * Returns an object suitable for Prisma's orderBy option.
 */
export function buildOrderByClause(
  sortBy: string,
  sortDirection: 'asc' | 'desc',
): Prisma.ProductOrderByWithRelationInput {
  return {
    [sortBy]: sortDirection,
    id: 'asc', // tiebreaker — always ascending for consistent ordering
  } as Prisma.ProductOrderByWithRelationInput;
}
