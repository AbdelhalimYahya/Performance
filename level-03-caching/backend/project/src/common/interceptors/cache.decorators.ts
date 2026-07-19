/**
 * cache.decorators.ts — Route-level caching metadata
 *
 * Attach these decorators to controller methods to control caching behavior.
 * The CacheInterceptor reads these via reflect-metadata at runtime.
 *
 * Usage:
 *   @Get('products')
 *   @Cacheable(60)
 *   @CacheKey('products')
 *   @CachePublic()
 *   async getProducts() { ... }
 */

import { SetMetadata } from '@nestjs/common';

// ============================================================================
// Metadata keys
// ============================================================================

export const CACHEABLE_KEY = 'cache:cacheable';
export const CACHE_TTL_KEY = 'cache:ttl';
export const CACHE_KEY_KEY = 'cache:key';
export const CACHE_PUBLIC_KEY = 'cache:public';
export const NO_CACHE_KEY = 'cache:no';

// ============================================================================
// Decorators
// ============================================================================

/**
 * @Cacheable(ttl?)
 * Marks a route as cacheable. If no TTL is provided, defaults to 60 seconds.
 *
 * @example
 * @Cacheable(120)  // cache for 2 minutes
 * @Cacheable()     // cache for 60 seconds (default)
 */
export function Cacheable(ttl = 60): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    SetMetadata(CACHEABLE_KEY, true)(target, propertyKey, descriptor);
    SetMetadata(CACHE_TTL_KEY, ttl)(target, propertyKey, descriptor);
  };
}

/**
 * @CacheKey(key)
 * Sets a custom cache key prefix. The full key becomes:
 *   "{key}:{method}:{path}:{sortedQuery}"
 *
 * @example
 * @CacheKey('products')
 */
export function CacheKey(key: string): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    SetMetadata(CACHE_KEY_KEY, key)(target, propertyKey, descriptor);
  };
}

/**
 * @CacheTTL(seconds)
 * Override the TTL for this specific route (in seconds).
 *
 * @example
 * @CacheTTL(300)  // 5 minutes
 */
export function CacheTTL(seconds: number): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    SetMetadata(CACHE_TTL_KEY, seconds)(target, propertyKey, descriptor);
  };
}

/**
 * @CachePublic()
 * Allow caching even when the request has an Authorization header.
 * By default, authenticated requests are never cached.
 *
 * @example
 * @CachePublic()
 * @Cacheable(60)
 * async getPublicProfile() { ... }
 */
export function CachePublic(): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    SetMetadata(CACHE_PUBLIC_KEY, true)(target, propertyKey, descriptor);
  };
}

/**
 * @NoCache()
 * Explicitly opt out of caching for this route, even if the global
 * interceptor is applied.
 *
 * @example
 * @NoCache()
 * async getLiveData() { ... }
 */
export function NoCache(): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    SetMetadata(NO_CACHE_KEY, true)(target, propertyKey, descriptor);
  };
}
