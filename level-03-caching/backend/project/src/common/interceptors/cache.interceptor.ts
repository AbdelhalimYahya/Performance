/**
 * cache.interceptor.ts — Production HTTP cache interceptor
 *
 * Intercepts GET requests and serves cached responses with proper headers.
 * Reads @Cacheable, @CacheKey, @CacheTTL, @CachePublic, @NoCache decorators
 * via reflect-metadata.
 *
 * Features:
 *   - ETag generation and If-None-Match → 304 handling
 *   - Cache-Control header generation (public, max-age, s-maxage, stale-while-revalidate)
 *   - X-Cache (HIT/MISS) and X-Cache-TTL response headers
 *   - Skips authenticated requests unless @CachePublic() is set
 *   - Skips error responses (status >= 400)
 *   - Skips non-GET requests
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, of, tap } from 'rxjs';
import { createHash } from 'crypto';
import { Reflector } from '@nestjs/core';
import {
  CACHEABLE_KEY,
  CACHE_TTL_KEY,
  CACHE_KEY_KEY,
  CACHE_PUBLIC_KEY,
  NO_CACHE_KEY,
} from './cache.decorators';

// ============================================================================
// Types
// ============================================================================

interface CachedResponse {
  body: unknown;
  status: number;
  headers: Record<string, string>;
  etag: string;
  timestamp: number;
}

// ============================================================================
// In-memory cache (replace with Redis in production)
// ============================================================================

const responseCache = new Map<string, CachedResponse>();
const MAX_CACHE_ENTRIES = 10_000;

// ============================================================================
// Interceptor
// ============================================================================

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    // --- Only cache GET requests ---
    if (req.method !== 'GET') {
      return next.handle();
    }

    // --- Check @NoCache decorator ---
    const noCache = this.reflector.getAllAndOverride<boolean>(NO_CACHE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (noCache) {
      return next.handle();
    }

    // --- Check @Cacheable decorator ---
    const cacheable = this.reflector.getAllAndOverride<boolean>(CACHEABLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!cacheable) {
      return next.handle();
    }

    // --- Skip authenticated requests unless @CachePublic() ---
    const isPublic = this.reflector.getAllAndOverride<boolean>(CACHE_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isPublic && req.headers.authorization) {
      return next.handle();
    }

    // --- Build cache key ---
    const cacheKeyPrefix = this.reflector.getAllAndOverride<string>(CACHE_KEY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const ttl = this.reflector.getAllAndOverride<number>(CACHE_TTL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? 60;

    const cacheKey = this.buildCacheKey(req, cacheKeyPrefix);

    // --- Check cache ---
    const cached = responseCache.get(cacheKey);

    if (cached) {
      // Check If-None-Match → 304
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === cached.etag) {
        res.status(304);
        res.setHeader('ETag', cached.etag);
        res.setHeader('X-Cache', 'HIT');
        return of(null);
      }

      // Serve cached response
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('ETag', cached.etag);
      res.setHeader('X-Cache-TTL', String(ttl));
      this.setCacheControlHeaders(res, ttl);
      return of(cached.body);
    }

    // --- Cache miss — execute handler and cache the result ---
    return next.handle().pipe(
      tap((body) => {
        const status = res.statusCode;

        // Don't cache error responses
        if (status >= 400) {
          res.setHeader('X-Cache', 'SKIP');
          res.setHeader('Cache-Control', 'no-store, no-cache');
          return;
        }

        // Generate ETag
        const etag = this.generateETag(body);

        // Store in cache
        this.setCacheEntry(cacheKey, {
          body,
          status,
          headers: {},
          etag,
          timestamp: Date.now(),
        });

        // Set response headers
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('ETag', etag);
        res.setHeader('X-Cache-TTL', String(ttl));
        this.setCacheControlHeaders(res, ttl);

        // Check If-None-Match after caching (first request)
        const ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch === etag) {
          res.status(304);
          res.send(null);
        }
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildCacheKey(
    req: any,
    customPrefix?: string,
  ): string {
    const sortedQuery = Object.keys(req.query || {})
      .sort()
      .map((k) => `${k}=${req.query[k]}`)
      .join('&');

    let key = customPrefix
      ? `${customPrefix}:${req.method}:${req.path}`
      : `http:${req.method}:${req.path}`;

    if (sortedQuery) {
      key += `:${sortedQuery}`;
    }

    // Include Accept-Language in key if present (Vary support)
    const acceptLang = req.headers['accept-language'];
    if (acceptLang) {
      key += `:lang:${acceptLang}`;
    }

    return key;
  }

  private generateETag(body: unknown): string {
    const hash = createHash('md5')
      .update(JSON.stringify(body))
      .digest('hex');
    return `"${hash}"`;
  }

  private setCacheEntry(key: string, entry: CachedResponse): void {
    // Evict oldest entries if at capacity
    if (responseCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = responseCache.keys().next().value;
      if (oldestKey) responseCache.delete(oldestKey);
    }
    responseCache.set(key, entry);
  }

  private setCacheControlHeaders(res: any, ttl: number): void {
    const directives = [
      'public',
      `max-age=${ttl}`,
      `s-maxage=${ttl * 2}`,
      'stale-while-revalidate=60',
    ];
    res.setHeader('Cache-Control', directives.join(', '));
  }
}
