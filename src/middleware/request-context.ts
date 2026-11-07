import type { MiddlewareHandler } from 'hono';
import { log } from '../lib/logger';
import type { AppEnv } from '../types';

export function requestContext(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);
    c.header('X-Request-Id', requestId);

    const startedAt = Date.now();
    try {
      await next();
    } finally {
      log('info', {
        requestId,
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status: c.res.status,
        durationMs: Date.now() - startedAt,
        cfRay: c.req.header('cf-ray') ?? null,
      });
    }
  };
}
