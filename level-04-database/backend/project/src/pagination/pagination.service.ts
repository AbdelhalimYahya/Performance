/**
 * Pagination Service — generic cursor and offset pagination for Prisma.
 *
 * Cursor pagination:
 * - Fetches limit+1 items to determine hasNextPage without a COUNT query
 * - Uses index seek (WHERE id > cursor) for O(log n) performance
 * - Stable under concurrent inserts/deletes
 *
 * Offset pagination:
 * - Uses SKIP/LIMIT which scans and discards rows
 * - O(n) performance — degrades linearly with page depth
 * - Unstable under concurrent inserts (can skip or duplicate items)
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CursorPaginationOptions,
  CursorPaginationResult,
  OffsetPaginationResult,
  PaginationRaceResult,
} from './pagination.types';
import {
  encodeCursor,
  decodeCursor,
  buildCursorWhereClause,
  buildOrderByClause,
} from './cursor.util';

@Injectable()
export class PaginationService {
  private readonly logger = new Logger(PaginationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generic cursor-based pagination.
   *
   * Strategy: fetch limit+1 items. If we get limit+1, hasNextPage=true
   * and we drop the extra item. This avoids a separate COUNT(*) query,
   * which would be expensive on large tables.
   *
   * @param options - cursor, limit, sortBy, sortDirection, filters
   * @returns paginated result with items, cursors, and boolean flags
   */
  async paginateWithCursor(
    options: CursorPaginationOptions,
  ): Promise<CursorPaginationResult<Record<string, unknown>>> {
    const {
      cursor: rawCursor,
      limit,
      sortBy,
      sortDirection,
      filters = {},
    } = options;

    // Clamp limit to [1, 100] to prevent abuse
    const safeLimit = Math.max(1, Math.min(100, limit));

    // Decode cursor if provided (null = first page)
    let cursorWhere: Prisma.ProductWhereInput = {};
    let prevCursor: string | null = null;

    if (rawCursor) {
      const cursor = decodeCursor(rawCursor);
      cursorWhere = buildCursorWhereClause(cursor, sortBy, sortDirection);

      // For 'prev' direction, we need to query in reverse and flip results
      if (cursor.direction === 'prev') {
        // Build reverse WHERE clause
        const reverseCursor = { ...cursor, direction: 'next' as const };
        cursorWhere = buildCursorWhereClause(reverseCursor, sortBy, sortDirection === 'asc' ? 'desc' : 'asc');
      }
    }

    // Build the Prisma query
    const where: Prisma.ProductWhereInput = {
      ...filters,
      ...cursorWhere,
    };

    const orderBy = buildOrderByClause(sortBy, sortDirection);

    // Fetch limit+1 to detect if there's a next page
    const items = await this.prisma.product.findMany({
      where,
      orderBy,
      take: safeLimit + 1,
    });

    // Determine pagination flags
    const hasNextPage = items.length > safeLimit;
    const hasPreviousPage = rawCursor !== null && rawCursor !== undefined;

    // Remove the extra item used for hasNextPage detection
    const pageItems = hasNextPage ? items.slice(0, safeLimit) : items;

    // For 'prev' direction, reverse the results (they were queried in reverse)
    const finalItems = rawCursor && decodeCursor(rawCursor).direction === 'prev'
      ? [...pageItems].reverse()
      : pageItems;

    // Build cursors from the first and last items
    const nextCursor =
      hasNextPage && finalItems.length > 0
        ? encodeCursor({
            id: finalItems[finalItems.length - 1].id,
            sortValue: finalItems[finalItems.length - 1][sortBy],
            direction: 'next',
          })
        : null;

    const prevPageCursor =
      hasPreviousPage && finalItems.length > 0
        ? encodeCursor({
            id: finalItems[0].id,
            sortValue: finalItems[0][sortBy],
            direction: 'prev',
          })
        : null;

    return {
      items: finalItems,
      nextCursor,
      prevCursor: prevPageCursor || (rawCursor ? rawCursor : null),
      hasNextPage,
      hasPreviousPage,
    };
  }

  /**
   * Traditional offset-based pagination for comparison.
   *
   * This is the slow path: OFFSET scans and discards rows.
   * At page 5000 with limit 20, PostgreSQL reads 100,020 rows
   * and throws away 100,000 of them.
   */
  async paginateWithOffset(
    page: number,
    limit: number,
  ): Promise<OffsetPaginationResult<Record<string, unknown>>> {
    const safeLimit = Math.max(1, Math.min(100, limit));
    const safePage = Math.max(1, page);
    const offset = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: safeLimit,
      }),
      this.prisma.product.count(),
    ]);

    const totalPages = Math.ceil(total / safeLimit);

    return {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPreviousPage: safePage > 1,
    };
  }

  /**
   * Race both pagination strategies and return timing comparison.
   * Useful for demonstrating the performance difference.
   */
  async getBothResults(
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginationRaceResult> {
    // Run both strategies in parallel for fair comparison
    const [cursorResult, offsetResult, cursorTime, offsetTime] =
      await Promise.all([
        this.paginateWithCursor({
          limit,
          sortBy: 'createdAt',
          sortDirection: 'desc',
        }),
        this.paginateWithOffset(page, limit),
        this.timeMs(() =>
          this.paginateWithCursor({
            limit,
            sortBy: 'createdAt',
            sortDirection: 'desc',
          }),
        ),
        this.timeMs(() => this.paginateWithOffset(page, limit)),
      ]);

    const winner =
      cursorTime.durationMs < offsetTime.durationMs ? 'cursor' : 'offset';
    const speedupFactor =
      winner === 'cursor'
        ? Math.round((offsetTime.durationMs / cursorTime.durationMs) * 100) / 100
        : Math.round((cursorTime.durationMs / offsetTime.durationMs) * 100) / 100;

    return {
      cursor: {
        durationMs: cursorTime.durationMs,
        itemCount: cursorResult.items.length,
      },
      offset: {
        durationMs: offsetTime.durationMs,
        itemCount: offsetResult.items.length,
      },
      winner,
      speedupFactor,
    };
  }

  /**
   * Measure execution time of an async function in milliseconds.
   */
  private async timeMs<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
    const start = performance.now();
    const result = await fn();
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    return { result, durationMs };
  }
}
