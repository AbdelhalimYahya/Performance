/**
 * products-cached.module.ts — Module wiring for cached products feature
 */

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ProductsCachedController } from './products-cached.controller';
import { ProductsCachedService } from './products-cached.service';
import { CacheWarmingService } from './cache-warming.service';

@Module({
  imports: [ScheduleModule],
  controllers: [ProductsCachedController],
  providers: [ProductsCachedService, CacheWarmingService],
})
export class ProductsCachedModule {}
