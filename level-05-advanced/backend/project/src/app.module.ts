import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import { WorkerPoolModule } from './worker-pool/worker-pool.module';
import { WorkersModule } from './workers/workers.module';
import { ClusterModule } from './cluster/cluster.module';
import { BullQueueModule } from './bull-queue/bull-queue.module';
import { QueueModule } from './queue/queue.module';
import { StreamProcessingModule } from './stream-processing/stream-processing.module';
import { StreamsModule } from './streams/streams.module';
import { GrpcModule } from './grpc/grpc.module';
import { StatelessModule } from './stateless/stateless.module';
import { HealthController } from './stateless/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TerminusModule,
    WorkerPoolModule,
    WorkersModule,
    ClusterModule,
    BullQueueModule,
    QueueModule,
    StreamProcessingModule,
    StreamsModule,
    GrpcModule,
    StatelessModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
