import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter';
import { CorrelationInterceptor } from './shared/interceptors/correlation.interceptor';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true, // Required for webhook signature verification
  });

  const config = app.get(ConfigService);

  // ── WebSocket adapter ──
  // Uses the Redis adapter when REDIS_URL is set (multi-node), else the
  // default in-memory adapter. connectToRedis() is a no-op without the env.
  const wsAdapter = new RedisIoAdapter(app);
  await wsAdapter.connectToRedis();
  app.useWebSocketAdapter(wsAdapter);

  // ── Global Prefix ──
  app.setGlobalPrefix('api');

  // ── API Versioning ──
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // ── Security Headers ──
  app.use(helmet({
    contentSecurityPolicy: config.get('NODE_ENV') === 'production' ? undefined : false,
    hsts: config.get('NODE_ENV') === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  }));

  // ── CORS ──
  const defaultOrigins = 'http://localhost:3000,http://localhost:3002,http://localhost:3003';
  app.enableCors({
    origin: config.get('CORS_ORIGINS', defaultOrigins).split(',').map((o: string) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'Idempotency-Key'],
    maxAge: 86400, // Preflight cache: 24 hours
  });

  // ── Global Filters ──
  app.useGlobalFilters(new GlobalExceptionFilter());

  // ── Global Interceptors ──
  app.useGlobalInterceptors(new CorrelationInterceptor());

  // ── Validation ──
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Shutdown Hooks ──
  app.enableShutdownHooks();

  // ── Start ──
  const port = config.get<number>('PORT', 3001);
  await app.listen(port);

  const env = config.get('NODE_ENV', 'development');
  console.log(`🚀 Martinonoir API running on http://localhost:${port}/api/v1 [${env}]`);
  console.log(`   Security: Helmet ✓  CORS ✓  Rate-Limit ✓  Validation ✓  RawBody ✓`);
}

bootstrap();

