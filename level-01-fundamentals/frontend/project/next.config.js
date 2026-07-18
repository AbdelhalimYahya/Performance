// next.config.js — Production-ready Next.js 14 configuration for performance measurement
// This file is wrapped with @next/bundle-analyzer to enable bundle analysis on demand

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  // Enable bundle analysis only when ANALYZE=true environment variable is set
  // Run: ANALYZE=true next build
  // This generates an interactive treemap in .next/analyze/client.html and server.html
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // React Strict Mode enables additional development warnings and checks
  // It double-invokes effects to catch missing cleanup functions
  // Always keep this enabled — it catches bugs before they reach production
  reactStrictMode: true,

  // Disable the "X-Powered-By: Next.js" header
  // Security best practice: don't reveal your framework to attackers
  poweredByHeader: false,

  // Image optimization configuration
  // next/image uses this to determine which remote domains are allowed for optimization
  // Without this, remote images will fail to load through next/image
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        // No path pattern needed — allow all images from this domain
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        // Unsplash images are commonly used for demos and placeholders
      },
    ],
    // Formats to serve when browser supports them
    // AVIF is ~50% smaller than JPEG, WebP is ~30% smaller
    // The browser automatically picks the best format it supports
    formats: ['image/avif', 'image/webp'],
  },

  // Custom webpack configuration for performance profiling
  webpack: (config, { dev, isServer }) => {
    // Enable source maps in production builds for profiling
    // Without this, the React Profiler and webpack-bundle-analyzer
    // cannot show meaningful file names and module sizes
    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        // Keep module names readable in production builds
        // This increases bundle size slightly but is essential for profiling
        // Remove this in production if profiling is not needed
        minimize: true,
        moduleIds: 'named',
      };
    }

    return config;
  },

  // Experimental features for performance optimization
  experimental: {
    // Enable the instrumentation hook (src/instrumentation.ts)
    // This runs once when the server starts — ideal for setting up
    // performance monitoring, APM agents, and global error handlers
    instrumentationHook: true,

    // Enable CSS optimization (Minify CSS, eliminate unused CSS)
    // Uses Lightning CSS under the hood for faster builds and smaller output
    // Reduces CSS bundle size by removing unused selectors
    optimizeCss: true,
  },

  // Security headers applied to every response
  // These protect against common web vulnerabilities
  async headers() {
    return [
      {
        // Apply these headers to all routes
        source: '/(.*)',
        headers: [
          {
            // Prevent the site from being embedded in iframes
            // Protects against clickjacking attacks
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            // Force browsers to interpret files using the declared Content-Type
            // Prevents MIME-type sniffing attacks
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            // Control how much referrer information is sent with requests
            // 'strict-origin-when-cross-origin' sends full URL for same-origin,
            // only origin for cross-origin, and nothing for downgrades (HTTP→HTTPS)
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            // Restrict browser features this site can use
            // Disable camera, microphone, geolocation, and interest-cohort (FLoC)
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },

  // URL redirects — runs before middleware
  // Use this for permanent redirects that should be cached by browsers and CDNs
  async redirects() {
    return [
      {
        // Redirect www to non-www for a clean, canonical URL
        // This consolidates SEO signals to a single domain
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'www.perf-fundamentals.example.com',
          },
        ],
        destination: 'https://perf-fundamentals.example.com/:path*',
        permanent: true, // 301 redirect — cached permanently
      },
    ];
  },

  // URL rewrites — invisible URL transformations
  // The user sees the original URL, but the server serves different content
  async rewrites() {
    return [
      {
        // Proxy API requests to a backend service
        // /api/v1/products → http://localhost:4000/api/v1/products
        // Useful for separating frontend and backend during development
        source: '/api/v1/:path*',
        destination: 'http://localhost:4000/api/v1/:path*',
      },
    ];
  },
};

// Wrap the entire config with the bundle analyzer plugin
// This adds the ANALYZE=true functionality without affecting other config
module.exports = withBundleAnalyzer(nextConfig);
