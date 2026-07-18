// ============================================================================
// Lighthouse CI Configuration
// ============================================================================
//
// HOW TO RUN:
//   npx lhci autorun
//
// This runs Lighthouse against each URL in the collect list, 3 times each,
// and compares the results against the assertions below. If any assertion
// fails, the command exits with a non-zero code (useful for CI/CD gates).
//
// PRESETS:
//   Default:   npx lhci autorun
//   Strict:    LHCI_PRESET=strict npx lhci autorun
//
// The "strict" preset uses tighter thresholds suitable for production
// deployment gates. Use the default for日常 development checks.
//
// REPORTS:
//   Reports are saved to .lighthouseci/ by default.
//   Each run generates an HTML report you can open in a browser.
// ============================================================================

module.exports = {
  ci: {
    // ==========================================================================
    // Collect Configuration
    // ==========================================================================
    // Defines which URLs to test and how to run them.
    collect: {
      // URLs to audit — each is tested independently
      url: [
        'http://localhost:3000',           // Homepage / main dashboard
        'http://localhost:3000/heavy',     // Heavy page (stress test)
        'http://localhost:3000/optimized', // Optimized page (comparison)
      ],
      // Run each URL 3 times to get statistically meaningful results.
      // Lighthouse results vary between runs due to network/CPU variance.
      // 3 runs is the industry standard for CI — balances accuracy vs speed.
      numberOfRuns: 3,
      // Command to start the server before testing
      startServerCommand: 'npm run start',
      // Regex pattern to wait for in stdout before running Lighthouse.
      // Next.js prints "Ready" when the server is listening.
      startServerReadyPattern: 'Ready',
      // Maximum seconds to wait for the server to be ready
      startServerReadyTimeout: 30,
      // Settings applied to each Lighthouse run
      settings: {
        // Use Chrome Headless with specific flags for CI environments
        chromeFlags: '--no-sandbox --headless --disable-gpu',
        // Throttle to simulate mid-tier mobile device on 4G
        // This gives realistic results that match real user conditions
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          cpuSlowdownMultiplier: 4,
        },
        // Use simulated throttling for speed (vs DevTools throttling)
        throttlingMethod: 'simulate',
        // Device emulation
        formFactor: 'mobile',
        screenEmulation: {
          disabled: false,
          width: 360,
          height: 640,
          deviceScaleFactor: 2.625,
          mobile: true,
        },
      },
    },

    // ==========================================================================
    // Assert Configuration
    // ==========================================================================
    // These thresholds gate your CI pipeline. If any metric exceeds the
    // threshold, Lighthouse CI fails the build.
    assert: {
      // Use "lighthouse:recommended" as a baseline, then override
      // specific assertions with stricter or looser thresholds.
      preset: 'lighthouse:recommended',
      assertions: {
        // -----------------------------------------------------------------------
        // Category Scores
        // -----------------------------------------------------------------------

        // Performance score: >= 80 (default threshold)
        // Google considers 90+ "good", 50-89 "needs improvement", <50 "poor"
        // We use 80 as a realistic CI gate — strict enough to catch regressions,
        // loose enough to not block on minor fluctuations.
        'categories:performance': ['error', { minScore: 0.8 }],

        // Accessibility: >= 90
        // WCAG 2.1 AA compliance is the legal standard in many countries.
        // Lighthouse checks: color contrast, ARIA labels, semantic HTML,
        // keyboard navigation, and more.
        'categories:accessibility': ['error', { minScore: 0.9 }],

        // Best Practices: >= 90
        // Checks for HTTPS, no vulnerable libraries, correct document lang,
        // no browser errors in console, etc.
        'categories:best-practices': ['error', { minScore: 0.9 }],

        // SEO: >= 80
        // Checks for meta description, viewport tag, robots.txt, hreflang,
        // document title, and more. 80 is realistic for most applications.
        'categories:seo': ['error', { minScore: 0.8 }],

        // -----------------------------------------------------------------------
        // Core Web Vitals & Key Metrics
        // -----------------------------------------------------------------------

        // Largest Contentful Paint (LCP): < 2500ms
        // Google's "good" threshold. Measures when the largest visible element
        // finishes rendering. Affects search ranking directly.
        // https://web.dev/lcp/
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],

        // Cumulative Layout Shift (CLS): < 0.1
        // Google's "good" threshold. Measures unexpected layout movement.
        // Affects search ranking directly. Lower is better.
        // https://web.dev/cls/
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],

        // Total Blocking Time (TBT): < 300ms
        // Proxy for Interaction to Next Paint (INP) in lab conditions.
        // Measures total time the main thread was blocked by long tasks
        // (tasks > 50ms) during page load.
        // https://web.dev/tbt/
        'total-blocking-time': ['error', { maxNumericValue: 300 }],

        // First Contentful Paint (FCP): < 1800ms
        // Google's "good" threshold. Measures when the first pixel of
        // content is painted. Indicates server response + render speed.
        // https://web.dev/fcp/
        'first-contentful-paint': ['error', { maxNumericValue: 1800 }],

        // Speed Index: < 3400ms
        // How quickly content is visually displayed during page load.
        // Useful for measuring perceived performance.
        'speed-index': ['error', { maxNumericValue: 3400 }],

        // Total Byte Weight: < 500KB
        // Total size of all resources transferred. Lower = faster on
        // slow networks. 500KB is aggressive but achievable for most apps.
        'total-byte-weight': ['error', { maxNumericValue: 512000 }],

        // Interactive: < 3800ms
        // Time until the page is fully interactive (responds to input).
        // Important for single-page apps with heavy JavaScript.
        'interactive': ['error', { maxNumericValue: 3800 }],

        // -----------------------------------------------------------------------
        // Specific Audit Checks
        // -----------------------------------------------------------------------

        // Render-blocking resources: warn if more than 3
        // Each render-blocking resource delays FCP and LCP.
        // https://web.dev/render-blocking-resources/
        'render-blocking-resources': ['warn', { allowedLength: 3 }],

        // Unused JavaScript: warn if more than 20% waste
        // Unused JS still needs to be downloaded, parsed, and compiled.
        // https://web.dev/unused-javascript/
        'unused-javascript': ['warn', { maxNumericValue: 20 }],

        // Image optimization: error on unoptimized images
        // Modern formats (WebP, AVIF) are 30-50% smaller than JPEG/PNG.
        'uses-optimized-images': 'error',

        // Efficient cache policy: error if static assets aren't cached
        // Browser caching eliminates network requests for repeat visits.
        'uses-long-cache-ttl': 'error',
      },
    },

    // ==========================================================================
    // Upload Configuration
    // ==========================================================================
    // Where to store Lighthouse reports for team review.
    upload: {
      // temporary-public-storage: free, no setup required.
      // Reports are stored for 7 days, then deleted.
      // For permanent storage, use: target: 'lhci-public-dashboard'
      target: 'temporary-public-storage',
      // Basic authentication (optional, for private dashboards)
      // username: process.env.LHCI_USERNAME,
      // password: process.env.LHCI_PASSWORD,
    },

    // ==========================================================================
    // Server Configuration (optional)
    // ==========================================================================
    // If you want Lighthouse CI to manage the server lifecycle.
    server: {
      // Port to start the server on
      port: 3000,
      // Number of attempts to start the server before failing
      maxRetries: 3,
    },
  },
};

// ============================================================================
// STRICT PRESET
// ============================================================================
// Usage: LHCI_PRESET=strict npx lhci autorun
//
// Tighter thresholds for production deployment gates.
// Use this in your CI pipeline before merging to main or deploying to prod.
// ============================================================================

if (process.env.LHCI_PRESET === 'strict') {
  module.exports.ci.assert = {
    assertions: {
      'categories:performance': ['error', { minScore: 0.9 }],
      'categories:accessibility': ['error', { minScore: 0.95 }],
      'categories:best-practices': ['error', { minScore: 0.95 }],
      'categories:seo': ['error', { minScore: 0.9 }],
      'largest-contentful-paint': ['error', { maxNumericValue: 2000 }],
      'cumulative-layout-shift': ['error', { maxNumericValue: 0.05 }],
      'total-blocking-time': ['error', { maxNumericValue: 200 }],
      'first-contentful-paint': ['error', { maxNumericValue: 1500 }],
      'speed-index': ['error', { maxNumericValue: 2500 }],
      'total-byte-weight': ['error', { maxNumericValue: 409600 }],
      'interactive': ['error', { maxNumericValue: 3000 }],
      'render-blocking-resources': 'error',
      'unused-javascript': ['error', { maxNumericValue: 10 }],
      'uses-optimized-images': 'error',
      'uses-long-cache-ttl': 'error',
    },
  };

  module.exports.ci.collect.numberOfRuns = 5;
}
