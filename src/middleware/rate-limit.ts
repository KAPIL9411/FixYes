import type { MiddlewareHandler } from 'hono';
import type { RateLimiterBinding } from '../env';
import { AppError } from '../lib/errors';
import type { AppEnv } from '../types';

export function rateLimit(
  limiter: RateLimiterBinding | undefined,
  bucket: string,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!limiter) {
      await next();
      return;
    }

    const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
    const { success } = await limiter.limit({ key: `${bucket}:${ip}` });
    if (!success) {
      throw new AppError(429, 'RATE_LIMITED', 'Too many requests');
    }
    await next();
  };
}
