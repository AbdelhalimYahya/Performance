import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import pino from 'pino';

// ============================================================================
// Logger Setup
// ============================================================================

// Create pino logger before NestJS bootstrap for early instrumentation
const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  // Pretty print in development, structured JSON in production
  transport: isProduction
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
  // Redact sensitive fields from logs
  redact: ['password', 'token', 'authorization', 'cookie'],
});

// ============================================================================
// Performance Instrumentation
// ============================================================================

// Track server start time for uptime calculation and bootstrap measurement
const serverStartTime = process.hrtime.bigint();

/**
 * Measures event loop lag by comparing expected vs actual interval delay.
 * A lag > 50ms indicates the event loop is blocked and requests will queue.
 */
function startEventLoopMonitor(): NodeJS.Timeout {
  let lastCheck = process.hrtime.bigint();

  return setInterval(() => {
    const now = process.hrtime.bigint();
    const expectedMs = 1000;
    const actualMs = Number((now - lastCheck) / BigInt(1_000_000));
    const lag = actualMs - expectedMs;
    lastCheck = now;

    if (lag > 50) {
      logger.warn({ lagMs: lag }, 'Event loop lag detected');
    }
  }, 1000);
}

/**
 * Monitors process memory usage every 30 seconds.
 * Warns if heap usage exceeds 80% of total heap, which may indicate a memory leak.
 */
function startMemoryMonitor(): NodeJS.Timeout {
  return setInterval(() => {
    const mem = process.memoryUsage();
    const heapUsedMB = (mem.heapUsed / 1048576).toFixed(1);
    const heapTotalMB = (mem.heapTotal / 1048576).toFixed(1);
    const rssMB = (mem.rss / 1048576).toFixed(1);
    const heapPct = (mem.heapUsed / mem.heapTotal) * 100;

    if (heapPct > 80) {
      logger.warn(
        { heapUsedMB, heapTotalMB, rssMB, heapPct: heapPct.toFixed(1) },
        'High memory usage detected'
      );
    } else {
      logger.debug({ heapUsedMB, heapTotalMB, rssMB }, 'Memory status');
    }
  }, 30_000);
}

// ============================================================================
// Bootstrap
// ============================================================================

async function bootstrap(): Promise<void> {
  const bootstrapStart = process.hrtime.bigint();

  // Create NestJS application with Express adapter
  const app = await NestFactory.create(AppModule, {
    // Use our pino logger instead of default NestJS logger
    logger: false,
  });

  // Set up pino-http for automatic request/response logging
  const pinoHttp = (await import('pino-http')).default;
  app.use(
    pinoHttp({
      logger,
      // Only log requests that take > 200ms (auto response time logging)
      autoLogging: {
        ignore: (req) => req.url === '/health',
      },
    })
  );

  // Security: Helmet adds security headers (X-Content-Type-Options, X-Frame-Options, etc.)
  const helmet = (await import('helmet')).default;
  app.use(helmet());

  // Performance: Gzip/Brotli compression for responses > 1KB
  const compression = (await import('compression')).default;
  app.use(compression({ threshold: 1024 }));

  // CORS configuration
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // Cache preflight for 24 hours
  });

  // Global API prefix: all routes start with /api/v1
  app.setGlobalPrefix('api/v1');

  // Global ValidationPipe: validates and transforms incoming DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties from DTOs
      forbidNonWhitelisted: true, // Throw error on unknown properties
      transform: true, // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Convert string query params to numbers
      },
    })
  );

  // Swagger documentation (only in non-production environments)
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Perf Fundamentals API')
      .setDescription('NestJS performance profiling and benchmarking API')
      .setVersion('1.0')
      .addTag('products', 'Product CRUD operations for benchmarking')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
    logger.info('Swagger docs available at /docs');
  }

  // Start monitoring intervals
  const eventLoopMonitor = startEventLoopMonitor();
  const memoryMonitor = startMemoryMonitor();

  // Measure bootstrap time
  const bootstrapDuration = Number((process.hrtime.bigint() - bootstrapStart) / BigInt(1_000_000));
  logger.info({ bootstrapMs: bootstrapDuration }, 'Bootstrap complete');

  // Start listening
  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);

  // Configure HTTP server timeouts for AWS ALB compatibility
  const httpServer = app.getHttpServer();
  httpServer.keepAliveTimeout = 65_000; // Just above ALB 60s timeout
  httpServer.headersTimeout = 66_000; // Must be > keepAliveTimeout

  logger.info({ port, env: process.env.NODE_ENV ?? 'development' }, 'Server started');

  // ==========================================================================
  // Graceful Shutdown
  // ==========================================================================

  const gracefulShutdown = async (reason: string): Promise<void> => {
    const shutdownStart = process.hrtime.bigint();
    const uptimeSec = Number((shutdownStart - serverStartTime) / BigInt(1_000_000_000));

    logger.info({ reason, uptimeSec }, 'Graceful shutdown initiated');

    // Stop monitoring
    clearInterval(eventLoopMonitor);
    clearInterval(memoryMonitor);

    // Close NestJS application (stops accepting new connections, drains existing ones)
    await app.close();

    const shutdownDuration = Number((process.hrtime.bigint() - shutdownStart) / BigInt(1_000_000));
    logger.info({ shutdownMs: shutdownDuration, uptimeSec }, 'Server shut down gracefully');

    process.exit(0);
  };

  // Handle termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM received'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT received'));

  // Handle uncaught errors without crashing
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ reason: String(reason) }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (error: Error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    gracefulShutdown('uncaughtException');
  });
}

// Start the application
bootstrap();
