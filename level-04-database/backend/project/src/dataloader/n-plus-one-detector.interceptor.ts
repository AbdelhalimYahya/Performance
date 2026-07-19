/**
 * N+1 Detector Interceptor — wraps every request to count database queries
 * and detect possible N+1 patterns.
 *
 * Uses AsyncLocalStorage to track query count within a request context.
 * After the request completes, logs the results:
 * - requestId, path, totalQueries, uniqueQueryPatterns
 * - If totalQueries > 5: logs WARN with repeated query patterns as evidence
 *
 * Integration: register as APP_INTERCEPTOR in AppModule for global coverage.
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../database/prisma.service';

export interface QueryContext {
  requestId: string;
  path: string;
  totalCount: number;
  queries: string[];
  patternCounts: Map<string, number>;
}

// AsyncLocalStorage instance for tracking query context across async calls
export const queryContextStorage = new AsyncLocalStorage<QueryContext>();

// Global counter for unique request IDs
let requestCounter = 0;

@Injectable()
export class NPlusOneDetectorInterceptor implements NestInterceptor {
  private readonly logger = new Logger(NPlusOneDetectorInterceptor.name);

  constructor(private readonly prisma: PrismaService) {
    // Attach Prisma query listener to count queries within the AsyncLocalStorage context
    this.prisma.$on('query', (event) => {
      const ctx = queryContextStorage.getStore();
      if (!ctx) return;

      ctx.totalCount++;

      // Normalize query pattern by replacing parameter values with placeholders
      const pattern = event.query
        .replace(/\$\d+/g, '$P')
        .replace(/'[^']*'/g, '$S')
        .replace(/\d+/g, '$N')
        .replace(/\s+/g, ' ')
        .trim();

      ctx.queries.push(event.query.substring(0, 200));
      ctx.patternCounts.set(pattern, (ctx.patternCounts.get(pattern) ?? 0) + 1);
    });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const requestId = `req-${++requestCounter}`;
    const path = request.url;

    const queryCtx: QueryContext = {
      requestId,
      path,
      totalCount: 0,
      queries: [],
      patternCounts: new Map(),
    };

    // Run the request handler inside AsyncLocalStorage context
    return new Observable<unknown>((subscriber) => {
      queryContextStorage.run(queryCtx, () => {
        next
          .handle()
          .pipe(
            tap(() => {
              this.logResults(queryCtx);
            }),
          )
          .subscribe(subscriber);
      });
    });
  }

  /**
   * Log query statistics after request completes.
   * If totalQueries > 5, warn about possible N+1 with pattern evidence.
   */
  private logResults(ctx: QueryContext): void {
    const uniquePatterns = ctx.patternCounts.size;

    this.logger.log(
      `[Query Stats] ${ctx.requestId} ${ctx.path} — ` +
        `total: ${ctx.totalCount}, unique patterns: ${uniquePatterns}`,
    );

    // N+1 detection: more than 5 queries suggests a potential N+1 problem
    if (ctx.totalCount > 5) {
      const repeated = Array.from(ctx.patternCounts.entries())
        .filter(([, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .map(([pattern, count]) => `  ${count}x: ${pattern.substring(0, 120)}`)
        .join('\n');

      this.logger.warn(
        `[Possible N+1] ${ctx.requestId} ${ctx.path} — ` +
          `${ctx.totalCount} queries detected!\n` +
          `Repeated patterns:\n${repeated}`,
      );
    }
  }
}
