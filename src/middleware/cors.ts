import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { parseList } from '../env';
import type { AppEnv } from '../types';

export function corsMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const allowed = parseList(c.env.APP_ORIGINS);
    return cors({
      origin: (origin) => (origin && allowed.includes(origin) ? origin : undefined),
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
      exposeHeaders: ['X-Request-Id', 'Idempotent-Replay'],
      maxAge: 600,
      credentials: false,
    })(c, next);
  };
}
