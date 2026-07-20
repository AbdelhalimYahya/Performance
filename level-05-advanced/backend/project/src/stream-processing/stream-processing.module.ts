import { Module } from '@nestjs/common';
import { StreamProcessingService } from './stream-processing.service';
import { StreamController } from './stream.controller';

@Module({
  providers: [StreamProcessingService],
  controllers: [StreamController],
  exports: [StreamProcessingService],
})
export class StreamProcessingModule {}
