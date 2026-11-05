import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { QueryFailedError } from 'typeorm';

// not_null_violation, check_violation: e.g. PATCH { "name": null }.
const INVALID_VALUE_CODES = new Set(['23502', '23514']);

/** Gives every failed request the shape described by `ErrorResponseDto`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(thrown: unknown, host: ArgumentsHost): void {
    const exception = this.normalize(thrown);
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!(exception instanceof HttpException)) {
      // Details stay in the log; unexpected errors must not leak to clients.
      this.logger.error(
        `${request.method} ${request.originalUrl}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json({
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      message: this.messageOf(exception, statusCode),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }

  private normalize(thrown: unknown): unknown {
    if (
      thrown instanceof QueryFailedError &&
      INVALID_VALUE_CODES.has(
        (thrown.driverError as { code?: string }).code ?? '',
      )
    ) {
      return new BadRequestException('A value is missing or not allowed');
    }
    return thrown;
  }

  private messageOf(exception: unknown, statusCode: number): string | string[] {
    if (!(exception instanceof HttpException)) {
      return STATUS_CODES[statusCode] ?? 'Error';
    }
    const body = exception.getResponse();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      return (body as { message: string | string[] }).message;
    }
    return exception.message;
  }
}
