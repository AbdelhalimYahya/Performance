/**
 * PM2 ECOSYSTEM CONFIG
 *
 * Run with: pm2 start ecosystem.config.js
 *
 * PM2 cluster mode:
 * - instances: "max" → one per CPU core
 * - exec_mode: "cluster" → PM2 manages the cluster, not our custom cluster.ts
 * - max_memory_restart: "1G" → restart worker if it exceeds 1GB
 *
 * Difference from our custom cluster.ts:
 * - PM2 handles forking, monitoring, log rotation, zero-downtime restart
 * - Our cluster.ts gives more control (custom health checks, IPC)
 * - Use PM2 for production, custom cluster for learning
 */

module.exports = {
  apps: [
    {
      name: 'perf-advanced-api',
      script: 'dist/main.js',
      instances: 'max',
      exec_mode: 'cluster',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        WEB_CONCURRENCY: 'max',
      },
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
      log_type: 'json',

      // Restart behavior
      restart_delay: 1000,
      max_restarts: 10,
      min_uptime: '5s',

      // Watch (disabled in production)
      watch: false,

      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,

      // Node.js flags
      node_args: '--max-old-space-size=800',
    },
  ],
};
