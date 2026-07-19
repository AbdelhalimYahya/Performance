/**
 * Pagination Controller — REST endpoints for cursor vs offset pagination.
 *
 * Endpoints:
 * - GET /pagination/cursor   — cursor-based: ?cursor=&limit=20&sortBy=createdAt&sortDirection=desc
 * - GET /pagination/offset   — traditional: ?page=1&limit=20
 * - GET /pagination/race     — runs both, returns timing comparison
 * - GET /pagination/race/:page — race for deep page N (demonstrates offset degradation)
 */
import {
  Controller,
  Get,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { PaginationService } from './pagination.service';

@Controller('pagination')
export class PaginationController {
  constructor(private readonly paginationService: PaginationService) {}

  /**
   * GET /pagination/cursor
   *
   * Cursor-based pagination — fast at any depth.
   * Uses index seek: WHERE (createdAt, id) < (cursorDate, cursorId)
   *
   * @param cursor - base64url-encoded cursor from previous response
   * @param limit - items per page (1-100, default 20)
   * @param sortBy - column to sort by (default: createdAt)
   * @param sortDirection - asc or desc (default: desc)
   */
  @Get('cursor')
  @HttpCode(HttpStatus.OK)
  async cursorPagination(
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('sortBy') sortBy?: string,
    @Query('sortDirection') sortDirection?: 'asc' | 'desc',
  ) {
    return this.paginationService.paginateWithCursor({
      cursor: cursor || null,
      limit: limit ?? 20,
      sortBy: sortBy ?? 'createdAt',
      sortDirection: sortDirection ?? 'desc',
    });
  }

  /**
   * GET /pagination/offset
   *
   * Traditional OFFSET pagination — slow at high page numbers.
   * At page 5000: scans 100,020 rows, discards 100,000.
   *
   * @param page - page number (default 1)
   * @param limit - items per page (default 20)
   */
  @Get('offset')
  @HttpCode(HttpStatus.OK)
  async offsetPagination(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.paginationService.paginateWithOffset(page ?? 1, limit ?? 20);
  }

  /**
   * GET /pagination/race
   *
   * Runs both pagination strategies and returns a head-to-head comparison.
   * Includes timing, item count, winner, and speedup factor.
   */
  @Get('race')
  @HttpCode(HttpStatus.OK)
  async race(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.paginationService.getBothResults(page ?? 1, limit ?? 20);
  }

  /**
   * GET /pagination/race/:page
   *
   * Run race specifically for a deep page number.
   * Demonstrates how offset degrades while cursor stays constant.
   *
   * @example GET /pagination/race/5000 — compares cursor vs offset at page 5000
   */
  @Get('race/:page')
  @HttpCode(HttpStatus.OK)
  async raceAtPage(
    @Param('page', ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.paginationService.getBothResults(page, limit ?? 20);
  }
}
