import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

/**
 * PROCESS_ROLE splits one codebase into two deployable components:
 * - "web" (default): serves HTTP, but stops every @Cron job registered by
 *   AutomationService/StuckStockService so a horizontally-scaled API never
 *   runs the same scheduled job N times in parallel.
 * - "worker": runs as a NestJS application context with no HTTP server at
 *   all (nothing to route to) - its only job is to let those @Cron jobs run.
 * Unset locally, this behaves exactly as before (single dev process doing both).
 */
async function bootstrap() {
  const role = process.env.PROCESS_ROLE || 'web';

  if (role === 'worker') {
    await NestFactory.createApplicationContext(AppModule);
    console.log('Worker process started - running scheduled jobs only, no HTTP server.');
    return;
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // The Google Sheet sync posts the whole tracker as JSON - a few hundred rows
  // easily passes Express's 100kb default.
  app.useBodyParser('json', { limit: '5mb' });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // This is the "web" component - scheduled jobs belong to the "worker"
  // component only, so stop every cron job NestJS auto-started on bootstrap.
  const schedulerRegistry = app.get(SchedulerRegistry);
  for (const job of schedulerRegistry.getCronJobs().values()) {
    job.stop();
  }

  const PORT = process.env.PORT || 3001;
  await app.listen(PORT);
  console.log(`Application is running on port ${PORT}`);
}

bootstrap().catch(error => {
  console.error('Failed to start application', error);
  process.exit(1);
});
