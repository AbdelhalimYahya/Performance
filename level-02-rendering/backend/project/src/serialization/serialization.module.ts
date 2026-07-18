import { Module } from '@nestjs/common';
import { SerializationController } from './serialization.controller';

@Module({
  controllers: [SerializationController],
  providers: [],
})
export class SerializationModule {}
