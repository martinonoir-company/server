import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpException,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { generateUlid } from '../entities/base.entity';

/**
 * Correlation ID + request logging interceptor.
 * - Assigns an X-Correlation-ID header to every request/response.
 * - Logs request timing (method, url, status, duration).
 * - Logs slow requests (>1s) as warnings.
 * - Logs failed requests with the real status code AND message — including
 *   validation error details for 400s — so guard/pipe rejections aren't
 *   silent. Previously this logged a bare "ERR 1ms" that hid the cause.
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
        error: (err: unknown) => {
          const duration = Date.now() - startTime;
          const { status, detail } = describeError(err);
          // Examples:
          //   POST /api/v1/products 400 1ms [..] (BadRequest: name must
          //     not be empty | variants must be an array)
          //   POST /api/v1/products 401 1ms [..] (Unauthorized)
          //   POST /api/v1/products 500 12ms [..] (TypeError: ...)
          this.logger.error(
            `${method} ${url} ${status} ${duration}ms [${correlationId}] ${detail}`,
          );
        },
      }),
    );
  }
}

/**
 * Pull a useful one-line description out of whatever error came down
 * the pipe. Handles Nest HttpExceptions (the common 4xx case) AND
 * plain Errors (the 5xx unhandled case).
 */
function describeError(err: unknown): { status: number; detail: string } {
  if (err instanceof HttpException) {
    const status = err.getStatus();
    const body = err.getResponse();
    if (typeof body === 'string') {
      return { status, detail: `(${err.name}: ${body})` };
    }
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      const msg = b['message'];
      const errorName = (b['error'] as string) ?? err.name;
      const msgStr = Array.isArray(msg)
        ? // class-validator returns string[] — show ALL the violations.
          (msg as unknown[]).map((m) => String(m)).join(' | ')
        : msg
        ? String(msg)
        : err.message;
      return { status, detail: `(${errorName}: ${msgStr})` };
    }
    return { status, detail: `(${err.name})` };
  }
  if (err instanceof Error) {
    return {
      status: 500,
      detail: `(${err.name}: ${err.message})`,
    };
  }
  return { status: 500, detail: `(Unknown error: ${String(err)})` };
}
