import cluster from 'cluster';
import * as os from 'os';

/**
 * CLUSTER ENTRY POINT
 *
 * This file replaces main.ts for cluster mode.
 * Run with: node dist/cluster.js
 *
 * Architecture:
 * - Primary process: forks workers, monitors health, handles graceful shutdown
 * - Worker processes: run NestJS app, report heartbeat to primary
 *
 * Distribution:
 * - Linux: round-robin (primary distributes connections evenly)
 * - Windows: OS-assigned (primary forwards handles)
 *
 * Cannot share in-process state across workers. Use Redis for shared state:
 * - Sessions, rate limiting, caching, distributed locks
 */

const numWorkers = parseInt(process.env.WEB_CONCURRENCY || String(os.cpus().length), 10);

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} starting ${numWorkers} workers`);
  console.log(`Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)}MB`);
  console.log(`CPUs: ${os.cpus().length} cores`);

  const workerStats = new Map<number, { pid: number; startTime: number; ready: boolean }>();

  // Fork one worker per CPU core
  for (let i = 0; i < numWorkers; i++) {
    const worker = cluster.fork();
    workerStats.set(worker.process.pid, {
      pid: worker.process.pid,
      startTime: Date.now(),
      ready: false,
    });
    console.log(`Forked worker ${worker.process.pid}`);
  }

  // Track worker exit — restart if unintentional
  cluster.on('exit', (worker, code, signal) => {
    const exitType = code !== 0 ? 'CRASHED' : 'graceful';
    console.log(`Worker ${worker.process.pid} exited (${exitType}, code=${code}, signal=${signal})`);
    workerStats.delete(worker.process.pid);

    // Restart crashed workers after 1s delay
    if (code !== 0) {
      setTimeout(() => {
        const newWorker = cluster.fork();
        workerStats.set(newWorker.process.pid, {
          pid: newWorker.process.pid,
          startTime: Date.now(),
          ready: false,
        });
        console.log(`Restarted worker ${newWorker.process.pid}`);
      }, 1000);
    }
  });

  // Aggregate stats from workers
  cluster.on('message', (worker, msg) => {
    if (msg.type === 'heartbeat') {
      const stats = workerStats.get(worker.process.pid);
      if (stats) {
        stats.ready = true;
      }
    }
  });

  // Health table every 10s
  setInterval(() => {
    const workers = Object.values(cluster.workers).filter(Boolean);
    console.log('\n--- Worker Health ---');
    console.log('PID'.padEnd(10) + 'Uptime'.padEnd(12) + 'Memory'.padEnd(12) + 'Status');
    for (const w of workers) {
      if (!w) continue;
      const info = workerStats.get(w.process.pid);
      const uptime = info ? ((Date.now() - info.startTime) / 1000).toFixed(0) + 's' : '?';
      const mem = `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0)}MB`;
      console.log(`${w.process.pid}`.padEnd(10) + uptime.padEnd(12) + mem.padEnd(12) + (info?.ready ? 'OK' : 'STARTING'));
    }
    console.log('----------------------\n');
  }, 10_000);

  // Graceful shutdown: notify all workers, wait for exit
  process.on('SIGTERM', () => {
    console.log('Primary received SIGTERM, shutting down workers...');
    const workers = Object.values(cluster.workers).filter(Boolean);
    let exited = 0;

    for (const w of workers) {
      if (!w) continue;
      w.send({ type: 'shutdown' });
      w.on('exit', () => {
        exited++;
        if (exited === workers.length) {
          console.log('All workers exited, shutting down primary');
          process.exit(0);
        }
      });
    }

    // Force exit after 10s
    setTimeout(() => {
      console.log('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  });
} else {
  // ─── WORKER PROCESS ────────────────────────────────────────────────────
  // Bootstrap NestJS app and report heartbeat to primary

  let requestCount = 0;
  let app: any;

  async function bootstrap() {
    // Import existing bootstrap function
    const { default: bootstrapFn } = await import('./main');
    app = await bootstrapFn();

    // Track requests via HTTP middleware
    const httpAdapter = app.getHttpAdapter();
    httpAdapter.getInstance().use((req: any, res: any, next: any) => {
      requestCount++;
      next();
    });

    // Heartbeat every 5s
    setInterval(() => {
      if (process.send) {
        process.send({
          type: 'heartbeat',
          pid: process.pid,
          uptime: process.uptime(),
          memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          requestCount,
        });
      }
    }, 5000);

    // Listen for shutdown from primary
    process.on('message', async (msg) => {
      if (msg.type === 'shutdown') {
        console.log(`Worker ${process.pid} received shutdown signal`);
        try {
          await app.close();
          console.log(`Worker ${process.pid} closed gracefully`);
        } catch (err) {
          console.error(`Worker ${process.pid} close error:`, err);
        }
        process.exit(0);
      }
    });
  }

  bootstrap().catch((err) => {
    console.error(`Worker ${process.pid} bootstrap failed:`, err);
    process.exit(1);
  });
}
