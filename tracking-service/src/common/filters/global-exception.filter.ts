import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { I18nContext } from 'nestjs-i18n';

/**
 * Global HTTP exception filter.
 *
 * Recognises an extended `HttpException` body shape:
 *   { errorCode: 'auth.invalidCredentials', args?: Record<string, unknown> }
 * When `errorCode` is present, the filter resolves the message from
 * `errors.<errorCode>` using the request's language (resolved by nestjs-i18n
 * via Accept-Language / ?lang= / x-lang). Legacy throws that pass a plain
 * string message still work — they fall through to the original behavior.
 *
 * The response shape now always carries `errorCode` (when available) so the
 * frontend's axios interceptor (`src/lib/apiError.ts`) can translate
 * client-side using the same key, independent of the request's language.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const i18n = I18nContext.current(host);

    let status: number;
    let message: string | string[];
    let error: string;
    let errorCode: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        errorCode = typeof resp.errorCode === 'string' ? resp.errorCode : undefined;
        const args =
          resp.args && typeof resp.args === 'object'
            ? (resp.args as Record<string, unknown>)
            : undefined;

        if (errorCode && i18n) {
          // Translate via the errors namespace; fall back to the raw key on miss.
          message = i18n.t(`errors.${errorCode}`, { args });
        } else {
          // Legacy shape — plain message field.
          message = (resp.message as string | string[]) ?? exception.message;
        }

        error = (resp.error as string) || HttpStatus[status] || 'Error';
      } else {
        message = String(exceptionResponse);
        error = HttpStatus[status] || 'Error';
      }

      // Log 5xx errors with full detail
      if (status >= 500) {
        this.logger.error(
          `${request.method} ${request.url} → ${status}`,
          exception.stack,
        );
      }
    } else {
      // Unexpected (non-HTTP) exceptions
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = 'internalServerError';
      message = i18n ? i18n.t('errors.internalServerError') : 'Internal server error';
      error = 'Internal Server Error';

      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      ...(errorCode ? { errorCode } : {}),
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
