/**
 * PrismaService — extended PrismaClient with lifecycle hooks,
 * query logging, and connection pool monitoring.
 *
 * Features:
 * - OnModuleInit: logs Prisma version, connected DB version, pool size
 * - Query logging: WARN for >100ms, ERROR for >1000ms with full SQL + params
 * - cleanupStaleConnections(): terminates idle connections older than threshold
 * - getPoolStats(): queries pg_stat_activity for connection state breakdown
 *
 * DATABASE_URL format:
 * postgresql://user:pass@host:5432/db?connection_limit=20&pool_timeout=10&connect_timeout=5
 */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export interface PoolStats {
  active: number;
  idle: number;
  idleInTransaction: number;
  waiting: number;
  total: number;
  poolSize: number;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private poolSize = 20;

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    // Log Prisma and database versions
    const [{ version: prismaVersion }] = await this.$queryRawUnsafe<
      { version: string }[]
    >("SELECT current_setting('server_version') AS version");

    // Extract connection_limit from DATABASE_URL or default to 20
    const dbUrl = process.env.DATABASE_URL ?? '';
    const limitMatch = dbUrl.match(/connection_limit=(\d+)/);
    this.poolSize = limitMatch ? parseInt(limitMatch[1], 10) : 20;

    this.logger.log(
      `PrismaService initialized — pool_size=${this.poolSize}, db_version=${prismaVersion}`,
    );

    // Attach query event listener for slow query detection
    this.$on('query', (event) => {
      const { query, duration, params } = event;

      if (duration > 1000) {
        this.logger.error(
          `[SLOW QUERY >1000ms] ${duration}ms | SQL: ${query} | Params: ${params}`,
        );
      } else if (duration > 100) {
        this.logger.warn(
          `[SLOW QUERY >100ms] ${duration}ms | SQL: ${query.substring(0, 120)}`,
        );
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('PrismaService disconnected');
  }

  /**
   * Get current connection pool statistics from pg_stat_activity.
   * Groups connections by state: active, idle, idle_in_transaction.
   */
  async getPoolStats(): Promise<PoolStats> {
    const rows = await this.$queryRawUnsafe<{ state: string; count: bigint }[]>(
      `SELECT
         COALESCE(state, 'null') AS state,
         COUNT(*)::int AS count
       FROM pg_stat_activity
       WHERE datname = current_database()
         AND pid != pg_backend_pid()
       GROUP BY state`,
    );

    const stats: PoolStats = {
      active: 0,
      idle: 0,
      idleInTransaction: 0,
      waiting: 0,
      total: 0,
      poolSize: this.poolSize,
    };

    for (const row of rows) {
      const count = Number(row.count);
      stats.total += count;

      switch (row.state) {
        case 'active':
          stats.active = count;
          break;
        case 'idle':
          stats.idle = count;
          break;
        case 'idle in transaction':
          stats.idleInTransaction = count;
          break;
        default:
          break;
      }
    }

    return stats;
  }

  /**
   * Terminate connections that have been idle for longer than the given threshold.
   * Useful for cleaning up stale connections in long-running applications.
   *
   * @param idleSeconds - connections idle longer than this are terminated (default: 300s)
   */
  async cleanupStaleConnections(idleSeconds = 300): Promise<{ terminated: number }> {
    const result = await this.$queryRawUnsafe<{ terminated: number }[]>(
      `SELECT pg_terminate_backend(pid) AS terminated
       FROM pg_stat_activity
       WHERE state = 'idle'
         AND state_change < NOW() - INTERVAL '${idleSeconds} seconds'
         AND datname = current_database()
         AND pid != pg_backend_pid()`,
    );

    const terminated = result.filter((r) => r.terminated).length;

    if (terminated > 0) {
      this.logger.warn(
        `Cleaned up ${terminated} stale connections (idle > ${idleSeconds}s)`,
      );
    }

    return { terminated };
  }

  /**
   * Get the configured pool size from the DATABASE_URL parameter.
   */
  getPoolSize(): number {
    return this.poolSize;
  }
}
