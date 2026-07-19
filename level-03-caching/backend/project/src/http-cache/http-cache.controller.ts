/**
 * http-cache.controller.ts — HTTP Cache Headers Reference
 *
 * Each route demonstrates a specific Cache-Control pattern with detailed
 * comments explaining when and why to use it. This is the canonical
 * reference for engineers implementing caching in NestJS.
 */

import {
  Controller, Get, Req, Res, HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { generateETag, isETagMatch } from './etag.util';

// ============================================================================
// Controller
// ============================================================================

@Controller('http-cache')
export class HttpCacheController {
  // ---------------------------------------------------------------------------
  // GET /http-cache/no-store
  //
  // Cache-Control: no-store
  //
  // "no-store" tells every cache (browser, CDN, proxy) to NEVER store this
  // response. Every request goes directly to the server.
  //
  // Use when:
  //   - Banking transactions, OTP codes, payment confirmations
  //   - Data that must never appear in browser history or disk
  //   - Security-sensitive responses
  //
  // Cost: Every request hits the origin. No bandwidth savings.
  // ---------------------------------------------------------------------------
  @Get('no-store')
  noStore(@Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      type: 'no-store',
      message: 'This response is never cached. Every request hits the server.',
      timestamp: new Date().toISOString(),
    });
  }

  // ---------------------------------------------------------------------------
  // GET /http-cache/no-cache
  //
  // Cache-Control: no-cache
  //
  // "no-cache" means the response CAN be stored, but MUST be revalidated
  // with the server before every use. The browser sends If-None-Match or
  // If-Modified-Since on every request.
  //
  // Use when:
  //   - Frequently changing data where freshness matters
  //   - User dashboards that need real-time accuracy
  //   - API responses that change every few seconds
  //
  // Cost: One round-trip per request for revalidation (304 if unchanged).
  // ---------------------------------------------------------------------------
  @Get('no-cache')
  noCache(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-cache');

    const body = {
      type: 'no-cache',
      message: 'Cached but must revalidate on every request.',
      timestamp: new Date().toISOString(),
    };

    const etag = generateETag(body);
    res.setHeader('ETag', etag);

    // If client sends matching ETag, return 304 (no body)
    if (isETagMatch(req.headers['if-none-match'] as string, etag)) {
      res.status(304).end();
      return;
    }

    res.json(body);
  }

  // ---------------------------------------------------------------------------
  // GET /http-cache/public
  //
  // Cache-Control: public, max-age=3600, s-maxage=7200
  //
  // "public" means CDN and intermediate proxies CAN cache this response.
  // "max-age=3600" means the browser keeps it fresh for 1 hour.
  // "s-maxage=7200" means the CDN keeps it fresh for 2 hours (overrides max-age).
  //
  // Use when:
  //   - Public product pages, blog posts, marketing content
  //   - Static API responses that don't change frequently
  //   - Content safe to serve from any CDN edge node
  //
  // Cost: First request hits origin. Subsequent requests served from cache.
  // ---------------------------------------------------------------------------
  @Get('public')
  public(@Res() res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=7200');
    res.setHeader('Vary', 'Accept-Encoding');

    const body = {
      type: 'public',
      message: 'Cached by browser (1hr) and CDN (2hr).',
      timestamp: new Date().toISOString(),
    };

    const etag = generateETag(body);
    const lastModified = new Date(Date.now() - 3600000).toUTCString();

    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', lastModified);
    res.json(body);
  }

  // ---------------------------------------------------------------------------
  // GET /http-cache/private
  //
  // Cache-Control: private, max-age=300
  //
  // "private" means only the browser can cache this — CDNs and proxies must NOT.
  // "max-age=300" means fresh for 5 minutes.
  //
  // Use when:
  //   - User-specific data (profile, settings, orders)
  //   - Data that should never be shared across users via CDN
  //   - Personalized API responses
  //
  // Cost: Browser caches but CDN does not. Each user gets their own copy.
  // ---------------------------------------------------------------------------
  @Get('private')
  private(@Res() res: Response) {
    res.setHeader('Cache-Control', 'private, max-age=300');

    res.json({
      type: 'private',
      message: 'Cached by browser only (5min). CDN will not store this.',
      timestamp: new Date().toISOString(),
    });
  }

  // ---------------------------------------------------------------------------
  // GET /http-cache/stale-while-revalidate
  //
  // Cache-Control: public, max-age=60, stale-while-revalidate=3600
  //
  // "stale-while-revalidate=3600" means: after the 60-second fresh period,
  // the browser can serve stale content for up to 1 hour while fetching a
  // fresh copy in the background.
  //
  // Use when:
  //   - Content where showing slightly stale data is acceptable
  //   - Social media feeds, product listings, news articles
  //   - You want instant page loads even after TTL expiry
  //
  // Cost: User may see stale content briefly, but page loads are instant.
  // ---------------------------------------------------------------------------
  @Get('stale-while-revalidate')
  staleWhileRevalidate(@Res() res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=3600');

    res.json({
      type: 'stale-while-revalidate',
      message: 'Fresh for 60s, then served stale for up to 1hr while revalidating.',
      timestamp: new Date().toISOString(),
    });
  }

  // ---------------------------------------------------------------------------
  // GET /http-cache/conditional
  //
  // Demonstrates conditional requests with If-None-Match and If-Modified-Since.
  //
  // How it works:
  //   1. First request: server returns 200 + ETag header
  //   2. Subsequent requests: browser sends If-None-Match: <etag>
  //   3. If ETag matches: server returns 304 (no body, no transfer)
  //   4. If ETag doesn't match: server returns 200 with new body + new ETag
  //
  // Use when:
  //   - Large responses where bandwidth is a concern
  //   - Resources that rarely change
  //   - API endpoints with expensive serialization
  //
  // Cost: 304 responses are ~200 bytes. 200 responses include full body.
  // ---------------------------------------------------------------------------
  @Get('conditional')
  conditional(@Req() req: Request, @Res() res: Response) {
    const body = {
      type: 'conditional',
      message: 'Supports If-None-Match (ETag) and If-Modified-Since (Last-Modified).',
      timestamp: new Date().toISOString(),
      version: 42,
    };

    const etag = generateETag(body);
    const lastModified = new Date('2024-12-01T00:00:00Z').toUTCString();

    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', lastModified);
    res.setHeader('Cache-Control', 'no-cache');

    // Check If-None-Match (ETag comparison)
    const ifNoneMatch = req.headers['if-none-match'] as string | undefined;
    if (ifNoneMatch && isETagMatch(ifNoneMatch, etag)) {
      res.status(304).end();
      return;
    }

    // Check If-Modified-Since (timestamp comparison)
    const ifModifiedSince = req.headers['if-modified-since'] as string | undefined;
    if (ifModifiedSince) {
      const clientDate = new Date(ifModifiedSince).getTime();
      const resourceDate = new Date(lastModified).getTime();
      if (clientDate >= resourceDate) {
        res.status(304).end();
        return;
      }
    }

    res.json(body);
  }

  // ---------------------------------------------------------------------------
  // GET /http-cache/vary
  //
  // Vary: Accept-Encoding, Accept-Language, Accept
  //
  // "Vary" tells caches to create separate entries based on request headers.
  // If a client sends Accept-Encoding: gzip, the gzip version is cached
  // separately from the uncompressed version.
  //
  // Use when:
  //   - Serving compressed and uncompressed versions
  //   - Multilingual content
  //   - Content negotiation (JSON vs XML)
  //
  // Cost: More cache entries = more memory. Overly broad Vary (e.g. Vary: *)
  // effectively disables caching.
  // ---------------------------------------------------------------------------
  @Get('vary')
  vary(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Vary', 'Accept-Encoding, Accept-Language, Accept');
    res.setHeader('Cache-Control', 'public, max-age=60');

    const accept = req.headers.accept ?? 'application/json';
    const acceptLang = req.headers['accept-language'] ?? 'en';
    const acceptEncoding = req.headers['accept-encoding'] ?? 'identity';

    res.json({
      type: 'vary',
      message: 'Separate cache entries per Accept, Accept-Language, Accept-Encoding.',
      variant: { accept, acceptLang, acceptEncoding },
      timestamp: new Date().toISOString(),
    });
  }
}
