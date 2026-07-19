/**
 * Application entry point — NestJS bootstrap with database optimization demos.
 *
 * Registers global pipes, enables CORS, and starts listening.
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({ origin: 'http://localhost:3000' });

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`Database Performance API running on http://localhost:${port}`);
}

bootstrap();
