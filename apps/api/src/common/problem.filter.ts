import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
  errors?: { path: string; code: string }[];
  retryAfter?: number;
}

/** Serialises every error as RFC 9457 application/problem+json. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    let problem: Problem;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const extra = typeof body === 'object' && body !== null ? (body as Partial<Problem>) : {};
      problem = {
        type: 'about:blank',
        title: HttpStatus[status]?.replace(/_/g, ' ').toLowerCase() ?? 'error',
        status,
        ...(typeof body === 'string' ? { detail: body } : {}),
        ...(extra.code ? { code: extra.code } : {}),
        ...(extra.detail ? { detail: extra.detail } : {}),
        ...(extra.errors ? { errors: extra.errors } : {}),
        ...(extra.retryAfter ? { retryAfter: extra.retryAfter } : {}),
      };
      if (extra.retryAfter) res.setHeader('Retry-After', String(extra.retryAfter));
    } else {
      // Log the error class only; messages can carry user data.
      this.logger.error(
        `Unhandled ${(exception as Error)?.name ?? 'error'}`,
        (exception as Error)?.stack,
      );
      problem = { type: 'about:blank', title: 'internal server error', status: 500 };
    }

    res.status(problem.status).type('application/problem+json').json(problem);
  }
}

/** HttpException with a machine-readable code the mobile app can translate. */
export class AppError extends HttpException {
  constructor(status: number, code: string, extra: Partial<Problem> = {}) {
    super({ code, ...extra }, status);
  }
}
