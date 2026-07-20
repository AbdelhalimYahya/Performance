/**
 * next.config.js — Production-grade performance configuration
 *
 * Covers: Bundle Analyzer, Webpack optimization, Image optimization,
 * Security headers, caching, CSS optimization, WASM support.
 *
 * Every section is commented with WHY — the reasoning behind each setting.
 */

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  // WHY: support ANALYZE=true (both), ANALYZE=server, ANALYZE=browser
  // Each mode helps diagnose different bundle issues
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ─── Strict Mode ────────────────────────────────────────────
  // WHY: enables additional development checks for common mistakes
  // Catches deprecated APIs, side effects in rendering, legacy context usage
  reactStrictMode: true,

  // ─── SWC Minification ───────────────────────────────────────
  // WHY: SWC minifier is 7x faster than Terser, produces smaller output
  // Uses Rust-based SWC compiler instead of JavaScript-based Terser
  swcMinify: true,

  // ─── Compression ────────────────────────────────────────────
  // WHY: enables gzip/Brotli compression at the Next.js server level
  // Reduces transfer size by ~70% for text-based assets
  compress: true,

  // ─── Source Maps ────────────────────────────────────────────
  // WHY: never ship source maps to production browsers
  // Exposes source code to anyone who opens DevTools
  // Generate maps locally for debugging with: NEXTJS_SOURCE_MAPS=true next build
  productionBrowserSourceMaps: false,

  // ─── Output Mode ────────────────────────────────────────────
  // WHY: standalone mode creates a minimal Docker image
  // Only includes necessary node_modules, reduces image size by ~80%
  output: 'standalone',

  // ─── Security Headers ───────────────────────────────────────
  // WHY: remove X-Powered-By header to avoid revealing Next.js version
  poweredByHeader: false,

  // ─── ETags ──────────────────────────────────────────────────
  // WHY: ETags enable conditional requests (If-None-Match)
  // Browser sends ETag, server responds 304 Not Modified if unchanged
  // Saves bandwidth for repeat visitors
  generateEtags: true,

  // ─── Image Optimization ─────────────────────────────────────
  // WHY: AVIF is ~50% smaller than WebP, WebP is ~30% smaller than JPEG
  // Serving modern formats reduces image transfer size dramatically
  images: {
    formats: ['image/avif', 'image/webp'],

    // WHY: these breakpoints match common device widths
    // Next.js generates responsive images at these sizes
    // 640 (mobile), 750 (iPhone), 828 (iPhone Plus), 1080 (laptop), 1200 (desktop), 1920 (large)
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],

    // WHY: these are the actual rendered sizes within the viewport
    // 16-96px covers thumbnails, icons, and small UI elements
    imageSizes: [16, 32, 48, 64, 96],

    // WHY: cache optimized images for 30 days (2592000 seconds)
    // Images rarely change, long cache avoids re-processing
    minimumCacheTTL: 2592000,
  },

  // ─── Headers ────────────────────────────────────────────────
  // WHY: caching strategy per asset type
  // Immutable assets (hashed filenames) get 1-year cache
  // Images get 30-day cache
  // Security headers applied to all routes
  headers: async () => [
    {
      // WHY: Next.js static assets have content hashes in filenames
      // "immutable" tells browser to never revalidate — hash guarantees uniqueness
      // 1-year max-age is standard for hashed static assets
      source: '/_next/static/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    },
    {
      // WHY: images change occasionally, 30-day cache is reasonable
      // Balances freshness with bandwidth savings
      source: '/images/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=2592000',
        },
      ],
    },
    {
      // WHY: security headers on all routes
      // X-Frame-Options: prevent clickjacking (cannot iframe this site)
      // X-Content-Type-Options: prevent MIME sniffing (browser must respect Content-Type)
      // Referrer-Policy: control how much referrer info is sent to other sites
      // Permissions-Policy: disable browser features you don't use (camera, microphone, geolocation)
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=()',
        },
      ],
    },
  ],

  // ─── Experimental Features ──────────────────────────────────
  experimental: {
    // WHY: instrumentation hook runs once when server starts
    // Used for: setting up logging, error reporting (Sentry), global middleware
    instrumentationHook: true,

    // WHY: optimizeCss uses Critters to inline critical CSS
    // Extracts above-the-fold CSS and inlines it, eliminating render-blocking CSS requests
    // Reduces FCP by inlining the CSS needed for initial paint
    optimizeCss: true,

    // WHY: optimizePackageImports tree-shakes barrel files automatically
    // Without this, importing { debounce } from 'lodash-es' still bundles the whole package
    // This tells Next.js to rewrite imports to direct file paths
    optimizePackageImports: ['lodash-es', 'date-fns', '@heroicons/react'],
  },
};

// ─── Webpack Customization ──────────────────────────────────
module.exports = withBundleAnalyzer({
  ...nextConfig,

  webpack: (config, { isServer, dev }) => {
    // ─── Module IDs ─────────────────────────────────────────
    // WHY: deterministic module IDs produce stable chunk hashes between builds
    // Without this, adding/removing a file changes ALL chunk hashes
    // With deterministic IDs, only affected chunks change → better CDN caching
    config.optimization.moduleIds = 'deterministic';

    // ─── WASM Support ───────────────────────────────────────
    // WHY: enables async WebAssembly module loading
    // Required for WASM integration (image processing, crypto, etc.)
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      outputModule: true,
    };

    // ─── Split Chunks Strategy ──────────────────────────────
    // WHY: splitChunks separates vendor code from application code
    // Vendor code changes rarely → separate chunk = better CDN caching
    // Application code changes often → separate chunk = smaller re-downloads
    config.optimization.splitChunks = {
      chunks: 'all',

      // WHY: maxInitialRequests controls how many chunks load in parallel on first visit
      // 25 allows granular splitting without too many HTTP requests
      // HTTP/2 multiplexing makes many small requests efficient
      maxInitialRequests: 25,

      // WHY: maxAsyncRequests controls parallel loading for dynamic imports
      // 30 allows aggressive lazy loading of route-level chunks
      maxAsyncRequests: 30,

      cacheGroups: {
        // ─── Framework Chunk ────────────────────────────────
        // WHY: React, ReactDOM, and Next.js are the largest, most stable dependencies
        // They change only on major version upgrades (months apart)
        // Separate chunk = browser caches it for a long time
        // maxSize 150KB prevents the chunk from growing too large
        framework: {
          test: /[\\/]node_modules[\\/](react|react-dom|next)[\\/]/,
          name: 'framework',
          chunks: 'all',
          priority: 40,
          maxSize: 150000,
        },

        // ─── Commons Chunk ──────────────────────────────────
        // WHY: code shared across 3+ pages goes here
        // Without this, shared code is duplicated in every route chunk
        // minChunks: 3 ensures only truly shared code is included
        commons: {
          name: 'commons',
          minChunks: 3,
          chunks: 'all',
          priority: 20,
          reuseExistingChunk: true,
        },

        // ─── Third-Party Libraries ──────────────────────────
        // WHY: heavy third-party libs (lodash-es, date-fns) get their own chunk
        // They change independently of your code
        // maxSize 80KB prevents any single lib from dominating the bundle
        lib: {
          test: /[\\/]node_modules[\\/]/,
          name: 'lib',
          chunks: 'all',
          priority: 10,
          maxSize: 80000,
        },
      },
    };

    return config;
  },
});
