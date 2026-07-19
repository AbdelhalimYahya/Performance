/**
 * Database Module — Global NestJS module providing PrismaService and PoolMonitorService.
 *
 * Configuration:
 * - Prisma connection pool via DATABASE_URL with query parameters:
 *   ?connection_limit=20&pool_timeout=10&connect_timeout=5
 * - Global scope so all modules can inject PrismaService
 */
import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PoolMonitorService } from './pool-monitor.service';

@Global()
@Module({
  providers: [PrismaService, PoolMonitorService],
  exports: [PrismaService, PoolMonitorService],
})
export class DatabaseModule {}
