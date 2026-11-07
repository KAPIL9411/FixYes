import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthService } from '../auth/service';
import type { RateLimiterBinding } from '../env';
import { AppError } from '../lib/errors';
import { parseJson } from '../lib/validation';
import { readBearerToken } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import type { AppEnv } from '../types';

const googleLoginSchema = z.object({
  idToken: z.string().min(1).max(12_000),
  nonce: z.string().min(16).max(200),
});

export interface AuthRouteDependencies {
  authService: AuthService;
  rateLimiter?: RateLimiterBinding;
}

export function createAuthRoutes(deps: AuthRouteDependencies) {
  return new Hono<AppEnv>()
    .post('/nonce', rateLimit(deps.rateLimiter, 'auth:nonce'), async (c) => {
      const result = await deps.authService.issueNonce();
      return c.json({ nonce: result.nonce, expiresAt: result.expiresAt.toISOString() });
    })
    .post('/google', rateLimit(deps.rateLimiter, 'auth:google'), async (c) => {
      const body = await parseJson(c, googleLoginSchema);
      const result = await deps.authService.loginWithGoogle(body);
      return c.json({
        token: result.token,
        expiresAt: result.expiresAt.toISOString(),
        user: result.user,
      });
    })
    .post('/refresh', rateLimit(deps.rateLimiter, 'auth:refresh'), async (c) => {
      const token = readBearerToken(c);
      if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
      const result = await deps.authService.rotate(token);
      return c.json({
        token: result.token,
        expiresAt: result.expiresAt.toISOString(),
        user: result.user,
      });
    })
    .post('/logout', async (c) => {
      const token = readBearerToken(c);
      if (token) await deps.authService.logout(token);
      return c.body(null, 204);
    });
}
