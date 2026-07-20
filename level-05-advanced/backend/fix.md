# How to Fix CPU Bottlenecks & Advanced Backend Issues

> Production-ready solutions for CPU-bound work, concurrency, memory management, and horizontal scaling in Node.js + NestJS.

---

## 1. Worker Threads — When and How

### The Exact Pattern

```typescript
// cpu-task.ts — the CPU-bound function (runs in worker thread)
import { parentPort, workerData } from 'worker_threads';

function heavyComputation(data: number[]): number {
  // CPU-intensive work — must not touch I/O or DOM
  let result = 0;
  for (let i = 0; i < data.length; i++) {
    result += Math.sqrt(data[i]) * Math.sin(data[i]);
  }
  return result;
}

parentPort?.postMessage(heavyComputation(workerData));
```

```typescript
// task-runner.ts — parent thread
import { Worker } from 'worker_threads';
import * as os from 'os';

export function runInWorker<TInput, TOutput>(
  workerPath: string,
  data: TInput,
): Promise<TOutput> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: data });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}
```

### Why Piscina (Worker Pool)

Raw `new Worker()` creates a new thread per task. Thread creation overhead is ~5ms — acceptable for long tasks but wasteful for many short tasks. Piscina reuses threads across tasks.

```typescript
import { Piscina } from 'piscina';

const pool = new Piscina({
  filename: './cpu-task.js',
  maxThreads: os.cpus().length - 1, // leave 1 core for event loop
  maxQueue: 100, // backpressure: reject tasks when queue is full
});

const result = await pool.run({ numbers: [1, 2, 3] });
```

### When NOT to Use Worker Threads

I/O-bound work (DB queries, HTTP requests) has no benefit from worker threads — the thread would just be idle waiting. Workers add complexity without performance gain for I/O.

---

## 2. Worker Thread Pool Design

### Generic Task Runner with Piscina

```typescript
// worker-pool.module.ts
import { Module } from '@nestjs/common';
import { Piscina } from 'piscina';
import * as os from 'os';
import { WorkerPoolService } from './worker-pool.service';

@Module({
  providers: [
    {
      provide: WorkerPoolService,
      useFactory: () => {
        const pool = new Piscina({
          filename: './worker-task.js',
          maxThreads: Math.max(1, os.cpus().length - 1),
          maxQueue: 100, // backpressure limit
          taskTimeout: 30000, // 30s timeout per task
        });
        return new WorkerPoolService(pool);
      },
    },
  ],
  exports: [WorkerPoolService],
})
export class WorkerPoolModule {}
```

```typescript
// worker-pool.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Piscina } from 'piscina';

export interface TaskResult<T> {
  data: T;
  durationMs: number;
}

@Injectable()
export class WorkerPoolService {
  private readonly logger = new Logger(WorkerPoolService.name);

  constructor(private readonly pool: Piscina) {}

  async run<TInput, TOutput>(taskName: string, input: TInput): Promise<TaskResult<TOutput>> {
    const start = performance.now();
    try {
      const data = await this.pool.run({ taskName, input }) as TOutput;
      const durationMs = performance.now() - start;
      this.logger.log(`Task ${taskName} completed in ${durationMs.toFixed(1)}ms`);
      return { data, durationMs };
    } catch (err) {
      this.logger.error(`Task ${taskName} failed: ${err}`);
      throw err;
    }
  }

  getStats() {
    return {
      queueSize: this.pool.queueSize,
      completed: this.pool.completed,
      running: this.pool.running,
    };
  }
}
```

---

## 3. Node.js Cluster Module

### Zero-Downtime Rolling Restart

```typescript
// cluster.ts
import cluster from 'cluster';
import * as os from 'os';
import * as http from 'http';

if (cluster.isPrimary) {
  const numWorkers = os.cpus().length;
  console.log(`Primary ${process.pid} forking ${numWorkers} workers`);

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  // Rolling restart: restart one worker at a time
  cluster.on('exit', (worker, code) => {
    console.log(`Worker ${worker.process.pid} died (code ${code}). Restarting...`);
    cluster.fork();
  });

  // Graceful restart: send SIGUSR2 to each worker sequentially
  process.on('SIGUSR2', async () => {
    const workers = Object.values(cluster.workers);
    for (const worker of workers) {
      if (!worker) continue;
      console.log(`Restarting worker ${worker.process.pid}...`);
      worker.disconnect();
      worker.on('disconnect', () => {
        cluster.fork();
      });
      // Wait for new worker to be ready before restarting next
      await new Promise((resolve) => cluster.once('listening', resolve));
    }
  });
} else {
  // Worker process
  const server = http.createServer((req, res) => {
    res.end(`Worker ${process.pid} handled request\n`);
  });
  server.listen(3000);
}
```

### Why You Cannot Share In-Process State

Each worker is a separate process with its own memory space. Use Redis for shared state:

```typescript
// ❌ BAD: in-memory map doesn't work across workers
const cache = new Map();

// ✅ GOOD: Redis works across all workers
import Redis from 'ioredis';
const redis = new Redis();
await redis.set('key', 'value');
```

---

## 4. Bull Queue for Async Processing

### When to Queue

Queue instead of awaiting inline when the user doesn't need to wait:
- Email sending
- PDF generation
- Analytics events
- Image processing
- Webhook delivery

### Queue Design with TypeScript

```typescript
// email.processor.ts
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';

export interface EmailJobData {
  to: string;
  subject: string;
  template: string;
  priority: 'low' | 'normal' | 'high';
}

@Processor('email')
export class EmailProcessor {
  @Process({ name: 'send', concurrency: 5 })
  async handleSend(job: Job<EmailJobData>) {
    console.log(`Processing email to ${job.data.to}`);
    // Send email logic here
    return { sent: true };
  }
}
```

```typescript
// email.service.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { EmailJobData } from './email.processor';

@Injectable()
export class EmailService {
  constructor(@InjectQueue('email') private emailQueue: Queue) {}

  async sendEmail(data: EmailJobData) {
    return this.emailQueue.add('send', data, {
      priority: data.priority === 'high' ? 1 : data.priority === 'low' ? 3 : 2,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
  }
}
```

### Dead Letter Queue

```typescript
// After 3 attempts, move to dead letter queue for inspection
emailQueue.on('failed', async (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await deadLetterQueue.add('failed-email', {
      ...job.data,
      error: err.message,
      failedAt: new Date(),
    });
  }
});
```

---

## 5. Stream Processing with Back-pressure

### Why Piping Handles Back-pressure

```typescript
// ❌ BAD: manual push loop ignores back-pressure, causes memory bloat
const data = await readFile('huge.csv'); // loads entire 1GB into memory!

// ✅ GOOD: piping handles back-pressure automatically
import { createReadStream, createWriteStream } from 'fs';
import { createGzip } from 'zlib';

createReadStream('huge.csv')
  .pipe(createGzip())
  .pipe(createWriteStream('huge.csv.gz'));
```

### Streaming CSV → Database

```typescript
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { Transform, pipeline } from 'stream';
import { promisify } from 'util';
import { Pool } from 'pg';

const pipelineAsync = promisify(pipeline);

class CsvToDbTransform extends Transform {
  private buffer: string[] = [];
  private readonly batchSize: number;

  constructor(private readonly pool: Pool, batchSize = 100) {
    super({ objectMode: true });
    this.batchSize = batchSize;
  }

  async _transform(chunk: Buffer, encoding: string, callback: Function) {
    const lines = chunk.toString().split('\n');
    this.buffer.push(...lines);

    while (this.buffer.length >= this.batchSize) {
      const batch = this.buffer.splice(0, this.batchSize);
      await this.pool.query(
        'INSERT INTO products (name, price) VALUES ' +
        batch.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(','),
        batch.flatMap((line) => {
          const [name, price] = line.split(',');
          return [name, parseFloat(price)];
        }),
      );
    }
    callback();
  }

  async _flush(callback: Function) {
    if (this.buffer.length > 0) {
      // Flush remaining rows
    }
    callback();
  }
}

// Usage: streams 1GB CSV, writes row-by-row to DB, never holds full file in memory
async function importCsv(filePath: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const transform = new CsvToDbTransform(pool, 100);

  await pipelineAsync(
    createReadStream(filePath),
    transform,
  );
}
```

---

## 6. gRPC in NestJS

```typescript
// proto/user.proto
syntax = "proto3";
package users;
service UserService {
  rpc GetUser (GetUserRequest) returns (UserResponse);
}
message GetUserRequest { string id = 1; }
message UserResponse { string id = 1; string name = 2; string email = 3; }
```

```typescript
// user.controller.ts
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';

@Controller()
export class UserController {
  @GrpcMethod('UserService', 'GetUser')
  async getUser(data: { id: string }) {
    return { id: data.id, name: 'John', email: 'john@example.com' };
  }
}
```

### Why gRPC Is Faster

- **Binary protobuf**: 3-5x smaller payloads than JSON
- **HTTP/2 multiplexing**: no head-of-line blocking
- **Header compression**: HPACK reduces repeated headers
- **Use for**: internal service-to-service calls, high-frequency APIs, streaming RPCs

---

## 7. Moving CPU-bound Operations

### Top 5 CPU-bound Operations and Fixes

| Operation | Problem | Fix |
|-----------|---------|-----|
| Large JSON parsing (>1MB) | `JSON.parse()` blocks event loop | Streaming JSON parser (`stream-json`) |
| bcrypt hashing | Intentionally slow (~100ms) | Move to worker thread |
| Image processing | CPU-intensive pixel manipulation | Use native `sharp` addon (C++) |
| PDF generation | Heavy DOM rendering | Move to worker thread or use `@react-pdf/renderer` |
| Data aggregation | Large dataset computation | Move to worker thread |

---

## 8. Avoiding Synchronous Blocking Patterns

```typescript
// ❌ BAD → ✅ GOOD
import { readFileSync } from 'fs';         → import { readFile } from 'fs/promises';
import { gzipSync } from 'zlib';           → import { gzip } from 'zlib/promises';
import crypto from 'crypto';               → crypto.subtle.digest(...);
import { lookup } from 'dns';              → import { lookup } from 'dns/promises';
import { sort } from 'fast-sort';          → sort in worker thread for >1M items
```

---

## 9. Process Memory Management

### Container-Aware Heap Size

```bash
# ❌ BAD: default 1.5GB for a 512MB container = OOM kill
node server.js

# ✅ GOOD: set max-old-space-size to 80% of container limit
node --max-old-space-size=400 server.js

# In Dockerfile:
CMD ["node", "--max-old-space-size=400", "dist/main.js"]
```

### OOM Handling

```typescript
process.on('exit', (code) => {
  if (code === 137) {
    console.error('OOM killed! Increase --max-old-space-size or container memory.');
  }
});

process.on('uncaughtException', (err) => {
  if (err.message?.includes('JavaScript heap out of memory')) {
    console.error('OOM: triggering graceful shutdown...');
    process.exit(1);
  }
});
```

---

## 10. Horizontal Scaling Preparation

### Stateless NestJS Application

```typescript
// session.module.ts — use Redis, not cookie-session
@Module({
  imports: [
    RedisModule.forRoot({ host: 'redis', port: 6379 }),
    SessionModule.forRoot({
      store: createRedisStore({ client: redisClient }),
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
    }),
  ],
})
export class SessionModule {}
```

```typescript
// rate-limit.module.ts — use Redis, not in-memory map
@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
      storage: new RedisThrottlerStorage(redisClient),
    }]),
  ],
})
export class RateLimitModule {}
```

```typescript
// health.controller.ts — check all dependencies
@Controller('health')
export class HealthController {
  @Get()
  async check() {
    const dbOk = await this.checkDb();
    const redisOk = await this.checkRedis();
    const status = dbOk && redisOk ? 200 : 503;
    return { status, db: dbOk, redis: redisOk };
  }
}
```

---

> **Next:** See [detect.md](./detect.md) for detection, then the project files in `./project/` for runnable implementations.
