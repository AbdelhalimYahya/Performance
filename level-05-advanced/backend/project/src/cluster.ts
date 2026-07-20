import cluster from 'cluster';
import * as os from 'os';

/**
 * CLUSTER MODULE
 *
 * cluster.fork() creates worker processes. Each is a separate Node.js instance
 * with its own event loop and memory space.
 *
 * Distribution:
 * - Linux (default): round-robin — primary distributes connections evenly
 * - Windows: OS-assigned — primary forwards handles, OS distributes
 *
 * Cannot share in-process state across workers. Use Redis instead for:
 * - Session storage
 * - Rate limiting counters
 * - Cache invalidation
 * - Distributed locks (Bull queue)
 *
 * Rolling restart:
 * 1. Send SIGUSR2 to primary
 * 2. Primary disconnects one worker at a time
 * 3. Waits for old worker to finish in-flight requests
 * 4. Forkes a new worker
 * 5. Repeats for each worker
 */
const numWorkers = parseInt(process.env.WEB_CONCURRENCY || String(os.cpus().length), 10);

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} forking ${numWorkers} workers`);
  console.log(`Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)}MB`);

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died (code=${code}, signal=${signal}). Restarting...`);
    cluster.fork();
  });

  // Graceful rolling restart
  process.on('SIGUSR2', async () => {
    const workers = Object.values(cluster.workers).filter(Boolean);
    console.log(`Rolling restart: ${workers.length} workers`);

    for (const worker of workers) {
      if (!worker) continue;
      console.log(`Restarting worker ${worker.process.pid}...`);
      worker.disconnect();
      await new Promise<void>((resolve) => {
        worker.on('disconnect', () => {
          cluster.fork();
          cluster.once('listening', () => resolve());
        });
      });
    }
  });

  process.on('SIGTERM', () => {
    console.log('Primary received SIGTERM, shutting down workers...');
    for (const worker of Object.values(cluster.workers)) {
      worker?.disconnect();
    }
    setTimeout(() => process.exit(0), 10000);
  });
} else {
  // Worker process — start NestJS app
  import('./main');
}
