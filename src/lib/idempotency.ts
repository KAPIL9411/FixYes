import type { Context } from 'hono';
import { AppError } from './errors';
import type { AppEnv } from '../types';

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function readIdempotencyKey(c: Context<AppEnv>): string {
  const raw = c.req.header('idempotency-key')?.trim();
  if (!raw) {
    throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
  }
  if (!KEY_PATTERN.test(raw)) {
    throw new AppError(
      400,
      'INVALID_IDEMPOTENCY_KEY',
      'Idempotency-Key must be 8-128 characters using letters, numbers, dashes or underscores',
    );
  }
  return raw;
}
