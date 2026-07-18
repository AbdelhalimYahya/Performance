import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({ origin: '*' });
  app.setGlobalPrefix('api/v1');

  await app.listen(3000);
  console.log('Level 02 Backend running on http://localhost:3000');
  console.log('Streaming endpoints: /api/v1/streaming/{buffered|streamed|chunked|compressed|compare|serialize|full}');
}

bootstrap();
