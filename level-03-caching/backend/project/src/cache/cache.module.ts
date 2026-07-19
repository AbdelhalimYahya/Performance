/**
 * cache.module.ts — NestJS Cache Module with Redis
 *
 * Registers cache-manager-ioredis-yet as the cache store, reads configuration
 * from ConfigService, and exports CacheService + CacheStatsService for
 * injection into any module.
 *
 * Usage:
 *   @Module({ imports: [CacheConfigModule.register()] })
 *   export class AppModule {}
 */

import { Module, Global } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createKeyGenerator } from 'cache-manager-keygen';
import { CacheService } from './cache.service';
import { CacheStatsService } from './cache-stats.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('REDIS_HOST', 'localhost');
        const port = config.get<number>('REDIS_PORT', 6379);
        const password = config.get<string>('REDIS_PASSWORD');
        const db = config.get<number>('REDIS_DB', 0);
        const ttlDefault = config.get<number>('REDIS_TTL_DEFAULT', 300_000); // 5 min

        return {
          store: 'redis',
          host,
          port,
          password: password || undefined,
          db,
          keyPrefix: 'perf:',
          commandTimeout: 5_000, // 5 second timeout for Redis commands
          ttl: ttlDefault,
          // Auto-generate unique keys to prevent collisions
          keyGenerator: createKeyGenerator({
            prefix: 'perf:',
          }),
        };
      },
    }),
  ],
  providers: [CacheService, CacheStatsService],
  exports: [CacheModule, CacheService, CacheStatsService],
})
export class CacheConfigModule {}
