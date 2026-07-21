/**
 * MEMORY MODULE — Memory Monitoring & Leak Detection
 *
 * Provides memory monitoring, heap snapshot management,
 * and a demo controller for testing leak detection.
 */

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MemoryMonitorService } from './memory-monitor.service';
import { HeapSnapshotService } from './heap-snapshot.service';
import { MemoryLeakDemoController } from './memory-leak-demo.controller';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [MemoryLeakDemoController],
  providers: [MemoryMonitorService, HeapSnapshotService],
  exports: [MemoryMonitorService, HeapSnapshotService],
})
export class MemoryModule {}
