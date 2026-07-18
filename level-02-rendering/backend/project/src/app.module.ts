import { Module } from '@nestjs/common';
import { StreamingModule } from './streaming/streaming.module';
import { SerializationModule } from './serialization/serialization.module';

@Module({
  imports: [StreamingModule, SerializationModule],
})
export class AppModule {}
