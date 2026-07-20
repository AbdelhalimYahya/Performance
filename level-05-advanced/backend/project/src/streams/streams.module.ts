import { Module } from '@nestjs/common';
import { StreamPipelineService } from './stream-pipeline.service';
import { StreamsController } from './streams.controller';

@Module({
  controllers: [StreamsController],
  providers: [StreamPipelineService],
  exports: [StreamPipelineService],
})
export class StreamsModule {}
