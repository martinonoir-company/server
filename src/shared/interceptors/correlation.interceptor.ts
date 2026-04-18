import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { generateUlid } from '../entities/base.entity';

/**
 * Correlation ID + request logging interceptor.
 * - Assigns an X-Correlation-ID header to every request/response
 * - Logs request timing (method, url, status, duration)
 * - Logs slow requests (>1s) as warnings
 */
@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Assign correlation ID
    const correlationId =
      (request.headers['x-correlation-id'] as string) ?? generateUlid();
    request.headers['x-correlation-id'] = correlationId;
    response.setHeader('X-Correlation-ID', correlationId);

    const startTime = Date.now();
    const { method, url } = request;

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;

          const logMessage = `${method} ${url} ${statusCode} ${duration}ms [${correlationId}]`;

          if (duration > 1000) {
            this.logger.warn(`SLOW ${logMessage}`);
          } else {
            this.logger.log(logMessage);
          }
        },
        error: () => {
          const duration = Date.now() - startTime;
          this.logger.error(`${method} ${url} ERR ${duration}ms [${correlationId}]`);
        },
      }),
    );
  }
}
