import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { generateUlid } from '../entities/base.entity';

/**
 * Global exception filter.
 * - Wraps all errors in a consistent envelope
 * - Assigns correlation IDs for tracing
 * - Logs server errors with full stack traces
 * - Never leaks internal details to the client in production
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Generate a unique correlation ID for this error
    const correlationId = (request.headers['x-correlation-id'] as string) ?? generateUlid();

    let status: number;
    let message: string | string[];
    let error: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responseBody = exception.getResponse();

      if (typeof responseBody === 'object' && responseBody !== null) {
        const body = responseBody as Record<string, unknown>;
        message = (body['message'] as string | string[]) ?? exception.message;
        error = (body['error'] as string) ?? HttpStatus[status] ?? 'Error';
      } else {
        message = exception.message;
        error = HttpStatus[status] ?? 'Error';
      }
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      error = 'Internal Server Error';

      // Never leak internal error details in production
      message =
        process.env['NODE_ENV'] === 'production'
          ? 'An unexpected error occurred'
          : exception.message;

      // Log the full stack for debugging
      this.logger.error(
        `[${correlationId}] Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      error = 'Internal Server Error';
      message = 'An unexpected error occurred';

      this.logger.error(`[${correlationId}] Unknown exception type:`, exception);
    }

    // Log all 5xx errors
    if (status >= 500) {
      this.logger.error(
        `[${correlationId}] ${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
