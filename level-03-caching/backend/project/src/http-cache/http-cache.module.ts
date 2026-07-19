/**
 * http-cache.module.ts — Module wiring for HTTP cache reference controller
 */

import { Module } from '@nestjs/common';
import { HttpCacheController } from './http-cache.controller';

@Module({
  controllers: [HttpCacheController],
})
export class HttpCacheModule {}
