/**
 * etag.util.ts — ETag generation and matching helpers
 *
 * ETags are opaque identifiers for a specific version of a resource.
 * The browser sends them back in If-None-Match so the server can
 * return 304 (not modified) instead of re-sending the full body.
 *
 * Format: W/"hash" — weak validator (content may differ semantically
 * but is equivalent for caching purposes).
 */

import { createHash } from 'crypto';

/**
 * Generates a weak ETag from any JSON-serializable value.
 *
 * The process:
 *   1. JSON.stringify the value (deterministic for same structure)
 *   2. MD5 hash the resulting string
 *   3. Wrap in W/"..." format
 *
 * @example
 * generateETag({ id: 1, name: 'foo' })
 * → 'W/"d1b96f2f3e2e9c1b0a8f7e6d5c4b3a21"'
 */
export function generateETag(data: unknown): string {
  const serialized = JSON.stringify(data, Object.keys(data as object).sort());
  const hash = createHash('md5').update(serialized).digest('hex');
  return `W/"${hash}"`;
}

/**
 * Compares a request's If-None-Match value against the response ETag.
 *
 * Handles the wildcard (*) and multiple ETag values (comma-separated).
 * Returns true if any request ETag matches the response ETag.
 *
 * @example
 * isETagMatch('"abc123"', '"abc123"')  → true
 * isETagMatch('"abc123", "def456"', '"def456"')  → true
 * isETagMatch('*', '"anything"')  → true
 * isETagMatch('"abc123"', '"xyz"')  → false
 */
export function isETagMatch(requestETag: string, responseETag: string): boolean {
  if (!requestETag || !responseETag) return false;

  // Wildcard matches everything
  if (requestETag.trim() === '*') return true;

  // Split comma-separated ETags (browser can send multiple)
  const requestETags = requestETag.split(',').map((e) => e.trim());

  return requestETags.some(
    (req) => req === responseETag || req === `"${responseETag.slice(2, -1)}"`,
  );
}
