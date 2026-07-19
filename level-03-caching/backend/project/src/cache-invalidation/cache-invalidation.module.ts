/**
 * cache-invalidation.module.ts — Module wiring for event-driven invalidation
 */

import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheInvalidationController } from './cache-invalidation.controller';
import { CacheInvalidationService } from './cache-invalidation.service';
import { InvalidationAuditService } from './invalidation-audit.service';

@Module({
  imports: [EventEmitterModule.forRoot()],
  controllers: [CacheInvalidationController],
  providers: [CacheInvalidationService, InvalidationAuditService],
})
export class CacheInvalidationModule {}
