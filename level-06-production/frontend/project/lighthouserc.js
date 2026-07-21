/**
 * Lighthouse CI Configuration
 *
 * Controls how LHCI collects, asserts, and uploads audit results.
 * Each assertion has a business reason comment explaining the threshold.
 */
module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:3000',           // Homepage — first impression
        'http://localhost:3000/products',  // Product list — high-traffic page
        'http://localhost:3000/products/1',// Product detail — conversion page
        'http://localhost:3000/dashboard', // Dashboard — authenticated experience
      ],
      numberOfRuns: 3, // Average 3 runs to reduce variance
      startServerCommand: 'npm start',
      startServerReadyPattern: 'ready',
    },
    assert: {
      // Start from recommended preset, then customize thresholds
      preset: 'lighthouse:recommended',
      assertions: {
        // Performance score: 85 minimum (not 90 — allows some flexibility
        // while still catching major regressions)
        'categories:performance': ['error', { minScore: 0.85 }],

        // LCP: 2500ms max — Google's "Good" threshold.
        // Users start abandoning after 3 seconds.
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],

        // CLS: 0.1 max — Google's "Good" threshold.
        // Layout shifts above 0.1 cause users to click wrong elements.
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],

        // TBT: 200ms max — proxy for INP in lab.
        // Above 200ms, users feel input delay.
        'total-blocking-time': ['error', { maxNumericValue: 200 }],

        // FCP: 1800ms max — users see first content quickly.
        // Above 1800ms, users think the page is broken.
        'first-contentful-paint': ['error', { maxNumericValue: 1800 }],

        // TTI: 3500ms max — page becomes interactive.
        // Above 3500ms, users abandon on mobile networks.
        'interactive': ['error', { maxNumericValue: 3500 }],

        // Image optimization: warn, not error.
        // Not all images can be optimized (third-party, icons).
        'uses-optimized-images': ['warn', { maxNumericValue: 5 }],
      },
    },
    upload: {
      // Upload results to temporary public storage for sharing
      target: 'temporary-public-storage',
    },
  },
};
