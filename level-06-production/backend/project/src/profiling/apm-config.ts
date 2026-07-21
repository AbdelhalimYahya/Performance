/**
 * APM CONFIGURATION REFERENCE
 *
 * This file contains heavily-commented configuration patterns for
 * the two most popular APM solutions: DataDog and New Relic.
 *
 * Neither is installed as a dependency — this is a reference guide.
 * Copy the relevant section and uncomment when integrating.
 *
 * ─────────────────────────────────────────────────────────────────
 *
 * CHOOSING BETWEEN DATADOG AND NEW RELIC
 *
 * | Feature              | DataDog                    | New Relic                  |
 * |----------------------|----------------------------|----------------------------|
 * | Pricing              | Per-host + per-feature     | Per-seat (free tier avail) |
 * | Language Support     | 8+ languages               | 10+ languages              |
 * | Trace Sampling       | Head-based + tail-based    | Head-based                 |
 * | Custom Metrics       | Yes (statsd + OTel)        | Yes (via Events API)       |
 * | Dashboard Quality    | Excellent (drag-and-drop)  | Good (NRQL-powered)        |
 * | Log Correlation      | Automatic (log injection)  | Automatic                  |
 * | Profiling            | Continuous profiling       | Thread profiling           |
 * | Alerting             | Advanced (anomaly detect)  | Advanced (anomalies)       |
 * | Learning Curve       | Steeper (many features)    | Moderate                   |
 *
 * Recommendation: DataDog if budget allows and you need advanced infrastructure
 * monitoring. New Relic if you want a simpler all-in-one APM with a free tier.
 */

// ═════════════════════════════════════════════════════════════════════════
// DATADOG APM SETUP
// ═════════════════════════════════════════════════════════════════════════
//
// Install: npm install dd-trace
//
// Required Environment Variables:
//   DD_API_KEY          — Your DataDog API key
//   DD_APP_KEY          — Your DataDog Application key
//   DD_SERVICE          — Service name (e.g., "perf-production-backend")
//   DD_ENV              — Environment (e.g., "production", "staging")
//   DD_VERSION          — App version (e.g., "1.0.0")
//   DD_AGENT_HOST       — DataDog agent host (default: "localhost")
//   DD_TRACE_AGENT_PORT — DataDog agent port (default: 8126)
//
// import ddTrace from 'dd-trace';
//
// ddTrace.init({
//   // Service identification — appears in all traces and metrics
//   service: process.env.DD_SERVICE || 'perf-production-backend',
//   env: process.env.DD_ENV || 'production',
//   version: process.env.DD_VERSION || '1.0.0',
//
//   // Sampling: percentage of traces to send to DataDog
//   // 1.0 = 100% (development), 0.1 = 10% (production recommended)
//   sampleRate: parseFloat(process.env.DD_TRACE_SAMPLE_RATE || '1'),
//
//   // Runtime metrics: auto-collect GC, event loop, memory metrics
//   runtimeMetrics: true,
//
//   // Database tracing: auto-instrument PG, MySQL, MongoDB queries
//   // Each query appears as a span in the trace waterfall
//   plugins: {
//     pg: { enabled: true },
//     redis: { enabled: true },
//     express: { enabled: true },
//   },
//
//   // Custom tags: appear on all traces from this service
//   tags: {
//     'team': 'platform',
//     'service.type': 'backend',
//   },
//
//   // Log injection: adds trace_id and span_id to pino/winston logs
//   // Enables log-trace correlation in DataDog Logs Explorer
//   logInjection: true,
//
//   // Distributed tracing: propagates trace context across services
//   // via HTTP headers (Datadog format: x-datadog-trace-id)
//   distributedTracing: true,
// });

// ═════════════════════════════════════════════════════════════════════════
// NEW RELIC APM SETUP
// ═════════════════════════════════════════════════════════════════════════
//
// Install: npm install newrelic
//
// Required Environment Variables:
//   NEW_RELIC_LICENSE_KEY  — Your New Relic license key
//   NEW_RELIC_APP_NAME     — Application name in New Relic
//   NEW_RELIC_ENV          — Environment name
//
// IMPORTANT: require('newrelic') must be the FIRST line in main.ts
//            before any other imports. New Relic patches modules at load time.
//
// // main.ts — first line:
// import 'newrelic';
//
// // newrelic.js config file (project root):
//
// module.exports = {
//   app_name: [process.env.NEW_RELIC_APP_NAME || 'perf-production-backend'],
//   license_key: process.env.NEW_RELIC_LICENSE_KEY,
//   logging: {
//     level: 'info',           // Log level for New Relic agent
//     forwarding: {
//       enabled: true,         // Send app logs to New Relic Logs
//       max_samples_stored: 10000,
//     },
//   },
//   allow_all_headers: true,   // Capture all HTTP headers as attributes
//   attributes: {
//     exclude: [
//       'request.headers.cookie',   // Never send cookies to APM
//       'request.headers.authorization', // Never send auth headers
//     ],
//   },
//   distributed_tracing: {
//     enabled: true,  // Enable W3C Trace Context propagation
//   },
//   slow_sql: {
//     enabled: true,
//     threshold: 500,  // Log queries slower than 500ms (ms)
//   },
//   transaction_tracer: {
//     enabled: true,
//     record_sql: 'obfuscated',  // Record queries with values removed
//     explain_threshold: 500,     // Explain queries slower than 500ms
//   },
//   error_collector: {
//     enabled: true,
//     ignore_classes: ['NotFoundError'], // Don't report 404s as errors
//   },
//   browser_monitoring: {
//     enable: false,  // Disable if frontend has separate monitoring
//   },
// };
