import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { log } from '../lib/logger';
import type { AppEnv } from '../types';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: { path: string; message: string }[];
  };
}

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get('requestId') ?? crypto.randomUUID();

  if (err instanceof AppError) {
    log(err.status >= 500 ? 'error' : 'warn', {
      requestId,
      code: err.code,
      status: err.status,
    });
    const body: ErrorBody = {
      error: { code: err.code, message: err.message, requestId },
    };
    if (err.details) body.error.details = err.details;
    return c.json(body, err.status as ContentfulStatusCode);
  }

  if (err instanceof ZodError) {
    log('warn', { requestId, code: 'VALIDATION_ERROR' });
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          requestId,
          details: err.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      } satisfies ErrorBody,
      400,
    );
  }

  if (err instanceof HTTPException) {
    const code = err.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'REQUEST_FAILED';
    log('warn', { requestId, code, status: err.status });
    return c.json(
      {
        error: {
          code,
          message: err.status === 413 ? 'Request body is too large' : 'Request failed',
          requestId,
        },
      } satisfies ErrorBody,
      err.status,
    );
  }

  log('error', {
    requestId,
    name: err instanceof Error ? err.name : 'UnknownError',
    message: err instanceof Error ? err.message : 'unknown',
  });

  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong',
        requestId,
      },
    } satisfies ErrorBody,
    500,
  );
};
