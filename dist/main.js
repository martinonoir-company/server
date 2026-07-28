"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const helmet_1 = __importDefault(require("helmet"));
const app_module_1 = require("./app.module");
const global_exception_filter_1 = require("./shared/filters/global-exception.filter");
const correlation_interceptor_1 = require("./shared/interceptors/correlation.interceptor");
const redis_io_adapter_1 = require("./modules/realtime/redis-io.adapter");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        bufferLogs: true,
        rawBody: true,
    });
    const config = app.get(config_1.ConfigService);
    const wsAdapter = new redis_io_adapter_1.RedisIoAdapter(app);
    await wsAdapter.connectToRedis();
    app.useWebSocketAdapter(wsAdapter);
    app.setGlobalPrefix('api');
    app.enableVersioning({
        type: common_1.VersioningType.URI,
        defaultVersion: '1',
    });
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: config.get('NODE_ENV') === 'production' ? undefined : false,
        hsts: config.get('NODE_ENV') === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    }));
    const defaultOrigins = [
        'http://localhost:3000',
        'http://localhost:3002',
        'http://localhost:3003',
        'http://localhost:3004',
    ].join(',');
    const allowlist = config
        .get('CORS_ORIGINS', defaultOrigins)
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin)
                return callback(null, true);
            if (allowlist.includes(origin))
                return callback(null, true);
            return callback(new Error(`CORS: origin ${origin} not allowed`), false);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'Idempotency-Key'],
        maxAge: 86400,
    });
    app.useGlobalFilters(new global_exception_filter_1.GlobalExceptionFilter());
    app.useGlobalInterceptors(new correlation_interceptor_1.CorrelationInterceptor());
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.enableShutdownHooks();
    const port = config.get('PORT', 3000);
    const host = config.get('HOST', '0.0.0.0');
    await app.listen(port, host);
    const env = config.get('NODE_ENV', 'development');
    console.log(`🚀 Martinonoir API listening on ${host}:${port}/api/v1 [${env}]`);
    console.log(`   Security: Helmet ✓  CORS ✓  Rate-Limit ✓  Validation ✓  RawBody ✓`);
}
bootstrap();
//# sourceMappingURL=main.js.map