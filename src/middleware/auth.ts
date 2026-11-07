import type { Context, MiddlewareHandler } from 'hono';
import type { AppRole } from '../db/schema';
import type { AuthContext } from '../auth/service';
import { AppError } from '../lib/errors';
import type { AppEnv } from '../types';

export function readBearerToken(c: Context<AppEnv>): string | null {
  const header = c.req.header('authorization');
  if (!header) return null;
  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer') return null;
  const token = rest.join('');
  return token.length > 0 ? token : null;
}

export function createRequireAuth(
  authenticate: (token: string) => Promise<AuthContext | null>,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = readBearerToken(c);
    if (!token) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }

    const auth = await authenticate(token);
    if (!auth) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired session');
    }

    c.set('auth', auth);
    await next();
  };
}

export function requireRole(role: AppRole): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get('auth');
    if (!auth || auth.user.roles.length === 0 || !auth.user.roles.includes(role)) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient role');
    }
    await next();
  };
}
